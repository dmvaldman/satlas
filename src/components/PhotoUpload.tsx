import React from 'react';
import ReactDOM from 'react-dom';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Location, Sit, PhotoResult } from '../types';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { OfflineService } from '../services/OfflineService';
import { LocationService } from '../services/LocationService';
import { convertDMSToDD } from '../utils/geo';


interface PhotoUploadProps {
  isOpen: boolean;
  sitId?: string;
  replacementImageId?: string;
  onClose: () => void;
  onPhotoUpload: (result: PhotoResult, sitId?: string, replacementImageId?: string) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

interface PhotoUploadState {
  isActive: boolean;
}

class PhotoUploadComponent extends React.Component<PhotoUploadProps, PhotoUploadState> {
  private modalRef = React.createRef<HTMLDivElement>();

  constructor(props: PhotoUploadProps) {
    super(props);
    this.state = {
      isActive: false
    };
  }

  componentDidMount() {
    // Set to active after a small delay to ensure initial transform is applied
    if (this.props.isOpen) {
      requestAnimationFrame(() => {
        this.setState({ isActive: true });
      });
    }
  }

  componentDidUpdate(prevProps: PhotoUploadProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      // Modal is opening
      requestAnimationFrame(() => {
        this.setState({ isActive: true });
      });
    } else if (prevProps.isOpen && !this.props.isOpen) {
      // Modal is closing
      this.setState({ isActive: false });
    }
  }

  private async getImageLocation(base64Image: string): Promise<Location> {
    console.log('[PhotoUpload] Starting EXIF extraction from image');

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${base64Image}`;

      img.onload = () => {
        try {
          console.log('[PhotoUpload] Image loaded, dimensions:', img.width, 'x', img.height);

          // @ts-ignore - EXIF is loaded globally (via a script tag in index.html)
          EXIF.getData(img, function() {
            // @ts-ignore
            const exifData = EXIF.getAllTags(this);
            console.log('[PhotoUpload] Raw EXIF data:', exifData);

            // Debug GPS info specifically
            console.log('[PhotoUpload] GPS data in EXIF:', {
              hasGPSLatitude: !!exifData?.GPSLatitude,
              hasGPSLongitude: !!exifData?.GPSLongitude,
              latRef: exifData?.GPSLatitudeRef,
              longRef: exifData?.GPSLongitudeRef,
              latValues: exifData?.GPSLatitude,
              longValues: exifData?.GPSLongitude
            });

            if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
              const latitude = convertDMSToDD(
                exifData.GPSLatitude,
                exifData.GPSLatitudeRef
              );
              const longitude = convertDMSToDD(
                exifData.GPSLongitude,
                exifData.GPSLongitudeRef
              );

              console.log('[PhotoUpload] Converted coordinates:', { latitude, longitude });

              if (
                !isNaN(latitude) &&
                !isNaN(longitude) &&
                latitude >= -90 &&
                latitude <= 90 &&
                longitude >= -180 &&
                longitude <= 180
              ) {
                resolve({ latitude, longitude });
                return;
              } else {
                console.error('[PhotoUpload] Invalid coordinates:', { latitude, longitude });
                reject(new Error('Invalid coordinates'));
              }
            } else {
              console.error('[PhotoUpload] No GPS data in EXIF');
              reject(new Error('No GPS data in EXIF'));
            }
          });
        } catch (error) {
          console.error('[PhotoUpload] Error reading EXIF:', error);
          reject(error);
        }
      };
    });
  }

  private getImageDimensions = (base64Data: string): Promise<{width: number, height: number}> => {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        // Ensure dimensions are valid (greater than zero)
        if (img.width > 0 && img.height > 0) {
          resolve({
            width: img.width,
            height: img.height
          });
        } else {
          // Reject with error if dimensions are invalid
          reject(new Error('Invalid image dimensions: width or height is zero'));
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for dimension calculation'));
      };

      // Ensure base64 data has the correct prefix
      if (!base64Data.startsWith('data:')) {
        img.src = `data:image/jpeg;base64,${base64Data}`;
      } else {
        img.src = base64Data;
      }
    });
  };

  private handleTakePhoto = async () => {
    try {
      console.log('[PhotoUpload] Starting camera capture');

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera
      });

      console.log('[PhotoUpload] Photo captured, extracting data');

      if (!image.base64String) {
        console.error('[PhotoUpload] No image data received');
        this.props.showNotification('No image data received', 'error');
        throw new Error('No image data received');
      }

      let location: Location | null = null;
      try {
        location = await this.getLocation();
        if (!location) {
          console.error('[PhotoUpload] No location data received');
          this.props.showNotification('No location data received', 'error');
          throw new Error('No location data received');
        }
      } catch (locationError) {
        console.error('[PhotoUpload] Error getting location:', locationError);
        this.props.showNotification('Error getting location', 'error');
        return;
      }

      // Get image dimensions
      let dimensions: {width: number, height: number};
      try {
        dimensions = await this.getImageDimensions(image.base64String);
      } catch (dimensionError) {
        console.error('[PhotoUpload] Error getting image dimensions:', dimensionError);
        this.props.showNotification('Invalid image dimensions', 'error');
        return;
      }

      this.props.onPhotoUpload({
        base64Data: image.base64String,
        location,
        dimensions
      }, this.props.sitId, this.props.replacementImageId);
    } catch (error) {
      // Check if error is a cancellation
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('cancel') ||
            errorMessage.includes('denied') ||
            errorMessage.includes('permission') ||
            errorMessage.includes('file does not exist')) {
          console.error('[PhotoUpload] Camera capture cancelled or permission denied:', error);
          return;
        }
      }

      console.error('[PhotoUpload] Error taking photo:', error);
      this.props.showNotification('Error accessing camera', 'error');
    }
  };

  private handleChooseFromGallery = async () => {
    try {
      console.log('[PhotoUpload] Starting gallery selection');
      let base64Data: string;

      // Platform-specific code to get the base64 image data
      if (Capacitor.getPlatform() === 'web') {
        console.log('[PhotoUpload] Using web implementation');
        // Web implementation using file input
        base64Data = await this.getImageFromWebFileInput();
        if (!base64Data) return; // User cancelled
      } else {
        console.log('[PhotoUpload] Using native implementation');
        // Native implementation using Capacitor
        base64Data = await this.getImageFromNativeGallery();
        if (!base64Data) return; // User cancelled or error
      }

      // Get image location
      let location: Location;
      try {
        location = await this.getImageLocation(base64Data);
      } catch (error) {
        console.error('[PhotoUpload] Error getting image location:', error);
        this.props.showNotification('Error getting image location', 'error');
        return;
      }

      // Get image dimension
      let dimensions: {width: number, height: number};
      try {
        dimensions = await this.getImageDimensions(base64Data);
      } catch (error) {
        console.error('[PhotoUpload] Error getting image dimensions:', error);
        this.props.showNotification('Invalid image dimensions', 'error');
        return;
      }

      this.props.onPhotoUpload({
        base64Data,
        location,
        dimensions
      }, this.props.sitId, this.props.replacementImageId);

    } catch (error) {
      // Check if error is a cancellation or user denied permission
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        console.log('[PhotoUpload] Error details:', errorMessage);
        if (errorMessage.includes('cancel') ||
            errorMessage.includes('denied') ||
            errorMessage.includes('permission')) {
          console.error('[PhotoUpload] Gallery selection cancelled or permission denied');
          return;
        }
      }

      console.error('[PhotoUpload] Error choosing photo:', error);
      this.props.showNotification('Error accessing photos', 'error');
    }
  };

  // Get image from web file input
  private getImageFromWebFileInput = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        try {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            console.log('Photo selection cancelled');
            resolve(''); // User cancelled, return empty string
            return;
          }

          // Convert to base64
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = (e.target?.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        } catch (error) {
          reject(error);
        }
      };

      input.click();
    });
  };

  private getImageFromNativeGallery = async (): Promise<string> => {
    if (Capacitor.getPlatform() === 'android') {
      return this.getImageFromAndroidGallery();
    } else if (Capacitor.getPlatform() === 'ios') {
      return this.getImageFromIOSGallery();
    } else {
      throw new Error('Unsupported platform');
    }
  };

  // Get image from Android gallery
  private getImageFromAndroidGallery = async (): Promise<string> => {
    try {
      console.log('[PhotoUpload] Starting native gallery selection');

      const result = await FilePicker.pickImages({
        limit: 1,
        readData: true
      });

      if (!result.files || result.files.length === 0) {
        throw new Error('No image selected');
      }

      const file = result.files[0];

      // Check if we have the data directly
      if (file.data) {
        console.log('[PhotoUpload] Got data directly');
        return file.data;
      }

      // If no data, try to get the path and read the file
      if (file.path) {
        console.log('[PhotoUpload] Got path, reading file');
        // Use Capacitor's Filesystem API to read the file
        const fileContent = await Filesystem.readFile({
          path: file.path,
          directory: Directory.External
        });

        if (typeof fileContent.data === 'string') {
          return fileContent.data;
        }
      }

      throw new Error('Could not read image data');
    } catch (error) {
      console.error('[PhotoUpload] Error getting image from gallery:', error);
      // Check if it's a user cancellation
      if (error instanceof Error &&
          (error.message.includes('cancel') ||
           error.message.includes('File does not exist'))) {
        return ''; // Return empty string for cancellation
      }
      throw error;
    }
  };

  // Get image from iOS gallery
  private getImageFromIOSGallery = async (): Promise<string> => {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos
    });

    if (!image.base64String) {
      console.error('[PhotoUpload] No image data received');
      this.props.showNotification('No image data received', 'error');
      throw new Error('No image data received');
    }

    return image.base64String;
  };

  private async getLocation(): Promise<Location | null> {
    // Try cached location first
    const cachedLocation = LocationService.getLastKnownLocation();
    if (cachedLocation) {
      return cachedLocation;
    }

    // Fall back to getting fresh location
    const locationService = new LocationService();
    return locationService.getCurrentLocation();
  }

  render() {
    const { isOpen, onClose } = this.props;
    const { isActive } = this.state;
    const isOffline = !OfflineService.getInstance().isNetworkOnline();

    if (!isOpen) return null;

    // Use React Portal to render at the document root
    return ReactDOM.createPortal(
      <div
        className={`modal-overlay ${isOpen ? 'active' : ''}`}
        style={{ display: isOpen ? 'flex' : 'none' }}
        onClick={onClose}
      >
        <div
          ref={this.modalRef}
          className={`modal-content photo-options ${isActive ? 'active' : ''}`}
          onClick={e => e.stopPropagation()}
        >
          {isOffline && (
            <div className="offline-notice">You're offline. Photos will upload when you're back online.</div>
          )}

          <button
            className="photo-option-button"
            onClick={this.handleTakePhoto}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
              <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
            </svg>
            Take Photo
          </button>

          <button
            className="photo-option-button"
            onClick={this.handleChooseFromGallery}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
            Choose from Gallery
          </button>

        </div>
      </div>,
      document.body
    );
  }
}

export default PhotoUploadComponent;