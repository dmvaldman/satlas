import React from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Location, PhotoResult } from '../types';
import { Capacitor } from '@capacitor/core';
import { OfflineService } from '../services/OfflineService';
import { LocationService } from '../services/LocationService';
import { convertDMSToDD } from '../utils/geo';
import BaseModal from './BaseModal';

interface PhotoUploadProps {
  isOpen: boolean;
  sitId?: string;
  replacementImageId?: string;
  onClose: () => void;
  onPhotoUpload: (result: PhotoResult) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

class PhotoUploadComponent extends React.Component<PhotoUploadProps> {
  private imageWidth = 1600;
  private quality = 90;

  private async resizeAndCompressImage(
    base64Data: string,
    maxWidth: number,
    quality: number // 0-100
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;

        // Calculate new dimensions while maintaining aspect ratio
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;
        if (targetWidth > maxWidth) {
          targetWidth = maxWidth;
          targetHeight = Math.round((targetWidth / originalWidth) * originalHeight);
        }

        // Ensure dimensions are valid
        if (targetWidth <= 0 || targetHeight <= 0) {
            reject(new Error(`Invalid calculated dimensions: ${targetWidth}x${targetHeight}`));
            return;
        }

        console.log(`[PhotoUpload] Resizing image from ${originalWidth}x${originalHeight} to ${targetWidth}x${targetHeight}`);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw the image onto the canvas
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Export the canvas content as JPEG with specified quality
        // toDataURL quality is 0.0 to 1.0
        const resizedBase64 = canvas.toDataURL('image/jpeg', quality / 100);

        // Remove the data URI prefix (data:image/jpeg;base64,)
        resolve(resizedBase64.split(',')[1]);
      };
      img.onerror = (error) => {
        console.error('[PhotoUpload] Image load error during resizing:', error);
        reject(new Error('Failed to load image for resizing'));
      };

      // Ensure base64 data has the correct prefix for image src
      if (!base64Data.startsWith('data:')) {
        img.src = `data:image/jpeg;base64,${base64Data}`;
      } else {
        img.src = base64Data;
      }
    });
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
    let originalBase64Data: string | null = null;
    try {
      console.log('[PhotoUpload] Starting camera capture');
      // 1. Acquire Original Image
      const image = await Camera.getPhoto({
        width: this.imageWidth,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera
      });
      console.log('[PhotoUpload] Photo captured.');

      if (!image.base64String) {
        throw new Error('No image data received from camera');
      }
      originalBase64Data = image.base64String;

      // 2. Get Location (Use device location for camera photos)
      let location: Location | null = null;
      try {
        location = await this.getLocation();
        if (!location) throw new Error('Could not get device location');
        console.log('[PhotoUpload] Device location obtained.');
      } catch (locationError) {
        console.error('[PhotoUpload] Error getting device location:', locationError);
        this.props.showNotification('Error getting location', 'error');
        return;
      }

      // 3. Get Dimensions from Original Data
      let dimensions: {width: number, height: number};
      try {
        dimensions = await this.getImageDimensions(originalBase64Data);
        console.log('[PhotoUpload] Original dimensions obtained:', dimensions);
      } catch (dimensionError) {
        console.error('[PhotoUpload] Error getting image dimensions:', dimensionError);
        this.props.showNotification('Invalid image dimensions', 'error');
        return;
      }

      // 4. Resize/Compress Original Data using Canvas
      let finalBase64Data: string;
      try {
        finalBase64Data = await this.resizeAndCompressImage(
          originalBase64Data,
          this.imageWidth,
          this.quality
        );
        console.log('[PhotoUpload] Image resized/compressed.');
      } catch (resizeError) {
        console.error('[PhotoUpload] Error resizing/compressing image:', resizeError);
        this.props.showNotification('Error processing image', 'error');
        return;
      }

      // 5. Prepare and Upload Result
      const photoResult: PhotoResult = {
        base64Data: finalBase64Data, // Use processed data
        location,                   // Use device location
        dimensions                 // Use original dimensions
      };
      this.props.onPhotoUpload(photoResult);

    } catch (error) {
      // Handle potential cancellations or other errors from Camera.getPhoto
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('cancel') || errorMessage.includes('denied') || errorMessage.includes('permission')) {
          console.log('[PhotoUpload] Camera operation cancelled or denied.');
          return; // Don't show generic error
        }
      }
      console.error('[PhotoUpload] Error taking photo:', error);
      this.props.showNotification('Error accessing camera', 'error');
    }
  };

  private handleChooseFromGallery = async () => {
    let originalBase64Data: string | null = null;
    try {
      console.log('[PhotoUpload] Starting gallery selection');

      // 1. Acquire Original Image (Platform specific)
      if (Capacitor.getPlatform() === 'web') {
        originalBase64Data = await this.getImageFromWebFileInput();
      } else {
        originalBase64Data = await this.getImageFromNativeGallery();
      }
      if (!originalBase64Data) return; // Exit if cancelled
      console.log('[PhotoUpload] Original image data acquired from gallery.');

      // 2. Get Location from Original EXIF Data
      let location: Location;
      try {
        location = await this.getImageLocation(originalBase64Data);
        console.log('[PhotoUpload] EXIF location obtained.');
      } catch (locationError) {
        console.error('[PhotoUpload] Error getting image EXIF location:', locationError);
        this.props.showNotification('Could not read location data from image.', 'error');
        return; // Stop if EXIF fails
      }

      // 3. Get Dimensions from Original Data
      let dimensions: {width: number, height: number};
      try {
        dimensions = await this.getImageDimensions(originalBase64Data);
        console.log('[PhotoUpload] Original dimensions obtained:', dimensions);
      } catch (dimensionError) {
        console.error('[PhotoUpload] Error getting image dimensions:', dimensionError);
        this.props.showNotification('Invalid image dimensions', 'error');
        return;
      }

      // 4. Resize/Compress Original Data using Canvas
      let finalBase64Data: string;
      try {
        finalBase64Data = await this.resizeAndCompressImage(
          originalBase64Data,
          this.imageWidth,
          this.quality
        );
        console.log('[PhotoUpload] Image resized/compressed.');
      } catch (resizeError) {
        console.error('[PhotoUpload] Error resizing/compressing image:', resizeError);
        this.props.showNotification('Error processing image', 'error');
        return;
      }

      // 5. Prepare and Upload Result
      const photoResult: PhotoResult = {
        base64Data: finalBase64Data, // Use processed data
        location,                   // Use EXIF location
        dimensions                 // Use original dimensions
      };
      this.props.onPhotoUpload(photoResult);

    } catch (error) {
       // General catch block for gallery errors
       if (error instanceof Error && (error.message.includes('cancel') || error.message.includes('No image selected'))) {
         console.log('[PhotoUpload] Gallery selection cancelled.');
         return; // Don't show generic error
       }
       console.error('[PhotoUpload] Error choosing photo from gallery:', error);
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
          reader.onload = async (e) => {
            try {
              const initialBase64WithPrefix = e.target?.result as string;
              if (!initialBase64WithPrefix) {
                  throw new Error('FileReader did not return result');
              }
              const initialBase64 = initialBase64WithPrefix.split(',')[1];

              // Return the ORIGINAL base64 data
              resolve(initialBase64);

            } catch (error) {
                 console.error('[PhotoUpload] Error processing file reader result:', error);
                 reject(error);
            }
          };
          reader.onerror = (error) => {
            console.error('[PhotoUpload] FileReader error:', error);
            reject(new Error('Failed to read file'));
          };
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
      console.log('[PhotoUpload] Starting Android gallery selection (expecting Base64)');

      const result = await FilePicker.pickImages({
        limit: 1,
        readData: true // Request Base64 data directly
      });

      if (!result.files || result.files.length === 0) {
        console.log('[PhotoUpload] No image selected from Android gallery.');
        return ''; // User cancelled
      }

      const file = result.files[0];

      // Check if we got the Base64 data
      if (!file.data) {
        throw new Error('No image data or path received from FilePicker');
      }

      // --- Resize and Compress using Canvas ---
      console.log('[PhotoUpload] Resizing image from Android gallery via canvas...');
      const finalBase64 = await this.resizeAndCompressImage(
        file.data, // Pass the Base64 data (potentially read from path)
        this.imageWidth,
        this.quality
      );
      console.log('[PhotoUpload] Image resized successfully.');
      return finalBase64;
      // --- End Resize ---

    } catch (error) {
      console.error('[PhotoUpload] Error getting/resizing image from Android gallery:', error);
      // Check if it's a user cancellation
      if (error instanceof Error &&
          (error.message.includes('cancel') || error.message.includes('No image selected'))) {
           console.log('[PhotoUpload] Android gallery selection cancelled.');
        return ''; // Return empty string for cancellation
      }
      throw error;
    }
  };

  // Get image from iOS gallery
  private getImageFromIOSGallery = async (): Promise<string> => {
    const image = await Camera.getPhoto({
      width: this.imageWidth,
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
    const isOffline = !OfflineService.getInstance().isNetworkOnline();

    return (
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
      >
        {isOffline && (
          <div className="offline-notice">You're offline. Photos will upload when you're back online.</div>
        )}

        <button
          className="modal-option-button"
          onClick={this.handleTakePhoto}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
            <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
          </svg>
          Take Photo
        </button>

        <button
          className="modal-option-button"
          onClick={this.handleChooseFromGallery}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          Choose from Gallery
        </button>
      </BaseModal>
    );
  }
}

export default PhotoUploadComponent;