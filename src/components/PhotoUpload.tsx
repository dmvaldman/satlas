import React from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Coordinates, Sit } from '../types';
import { Capacitor } from '@capacitor/core';

// Helper function to convert GPS coordinates from degrees/minutes/seconds to decimal degrees
function convertDMSToDD(dms: number[], direction: string): number {
  const degrees = dms[0];
  const minutes = dms[1];
  const seconds = dms[2];

  let dd = degrees + (minutes / 60) + (seconds / 3600);

  if (direction === 'S' || direction === 'W') {
    dd *= -1;
  }

  return dd;
}

interface PhotoUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCapture: (result: PhotoResult, existingSit?: Sit | { sitId: string; imageId: string; }) => void;
  isUploading?: boolean;
  sit?: Sit | { sitId: string; imageId: string; };
}

interface PhotoUploadState {
  error: string | null;
}

interface PhotoResult {
  base64Data: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

class PhotoUploadComponent extends React.Component<PhotoUploadProps, PhotoUploadState> {
  constructor(props: PhotoUploadProps) {
    super(props);
    this.state = {
      error: null
    };
  }

  private showNotification(message: string, type: 'success' | 'error') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  private async getImageLocationFromBase64(base64Image: string): Promise<Coordinates | null> {
    console.log('[PhotoUpload] Starting EXIF extraction from image');

    return new Promise((resolve) => {
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
                console.warn('[PhotoUpload] Invalid coordinates:', { latitude, longitude });
                resolve(null);
              }
            } else {
              console.log('[PhotoUpload] No GPS data in EXIF');
              resolve(null);
            }
          });
        } catch (error) {
          console.error('[PhotoUpload] Error reading EXIF:', error);
          resolve(null);
        }
      };

      img.onerror = (err) => {
        console.error('[PhotoUpload] Error loading image:', err);
        resolve(null);
      };
    });
  }

  private async getDeviceLocation(): Promise<Coordinates | null> {
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    } catch (error) {
      console.error('Error getting device location:', error);
      return null;
    }
  }

  private handleChooseFromGallery = async () => {
    try {
      if (Capacitor.getPlatform() === 'web') {
        // Web implementation using file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;

          // Convert to base64
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = (e.target?.result as string).split(',')[1];
              resolve(base64);
            };
            reader.readAsDataURL(file);
          });

          const location = await this.getImageLocationFromBase64(base64Data);

          if (!location) {
            this.showNotification('No location data in image', 'error');
            this.setState({ error: 'Image must contain location data' });
            return;
          }

          this.props.onClose();
          await this.props.onPhotoCapture({
            base64Data,
            location
          }, this.props.sit);
        };

        input.click();
      } else {
        // Native implementation using Capacitor
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Photos
        });

        if (!image.base64String) {
          throw new Error('No image data received');
        }

        const location = await this.getImageLocationFromBase64(image.base64String);

        if (!location) {
          this.showNotification('No location data in image', 'error');
          this.setState({ error: 'Image must contain location data' });
          return;
        }

        this.props.onClose();
        await this.props.onPhotoCapture({
          base64Data: image.base64String,
          location
        }, this.props.sit);
      }
    } catch (error) {
      console.error('Error choosing photo:', error);
      this.setState({ error: 'Error choosing photo' });
    }
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
        throw new Error('No image data received');
      }

      // Try to get location from EXIF data first
      let location = await this.getImageLocationFromBase64(image.base64String);

      // If no location from EXIF, try to get current device location
      if (!location) {
        console.log('[PhotoUpload] No EXIF location, trying device location');
        location = await this.getDeviceLocation();

        if (location) {
          console.log('[PhotoUpload] Using device location instead:', location);
        }
      }

      if (!location) {
        this.showNotification('No location data found', 'error');
        this.setState({ error: 'Image location could not be determined' });
        return;
      }

      this.props.onClose();
      this.props.onPhotoCapture({
        base64Data: image.base64String,
        location
      }, this.props.sit);
    } catch (error) {
      console.error('[PhotoUpload] Error taking photo:', error);
      this.setState({ error: 'Error taking photo' });
      this.showNotification('Error taking photo', 'error');
    }
  };

  render() {
    const { isOpen, isUploading, onClose } = this.props;
    const { error } = this.state;

    if (!isOpen) return null;

    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="photo-options" onClick={e => e.stopPropagation()}>
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            className="photo-option-button"
            onClick={this.handleTakePhoto}
            disabled={isUploading}
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
            disabled={isUploading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
            Choose from Gallery
          </button>

          <button
            className="photo-option-button cancel-button"
            onClick={onClose}
            disabled={isUploading}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
}

export default PhotoUploadComponent;