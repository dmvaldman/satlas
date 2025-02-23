import React from 'react';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Coordinates, Sit } from '../types';

/// <reference types="vite/client" />

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
  onPhotoCapture: (result: PhotoResult, existingSit?: Sit) => Promise<void>;
  replaceInfo: { sitId: string; imageId: string; } | null;
  isUploading?: boolean;
  sit?: Sit;
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

  componentDidMount() {
    if (import.meta.env.VITE_LEGACY_SUPPORT === 'true') {
      window.addEventListener('openPhotoUploadModal', this.handleGlobalOpen as EventListener);
    }
  }

  componentWillUnmount() {
    if (import.meta.env.VITE_LEGACY_SUPPORT === 'true') {
      window.removeEventListener('openPhotoUploadModal', this.handleGlobalOpen as EventListener);
    }
  }

  private showNotification(message: string, type: 'success' | 'error') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  // ---------------------------------------------------
  // New method that extracts GPS coordinates from a base64 image
  private async getImageLocationFromBase64(base64Image: string): Promise<Coordinates | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${base64Image}`;
      img.onload = () => {
        try {
          // @ts-ignore - EXIF is loaded globally (via a script tag in index.html)
          EXIF.getData(img, function() {
            // @ts-ignore
            const exifData = EXIF.getAllTags(this);
            console.log('Raw EXIF data:', exifData);
            if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
              const latitude = convertDMSToDD(
                exifData.GPSLatitude,
                exifData.GPSLatitudeRef
              );
              const longitude = convertDMSToDD(
                exifData.GPSLongitude,
                exifData.GPSLongitudeRef
              );
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
                console.warn('Invalid coordinates:', { latitude, longitude });
                resolve(null);
              }
            } else {
              console.log('No GPS data in EXIF');
              resolve(null);
            }
          });
        } catch (error) {
          console.error('Error reading EXIF:', error);
          resolve(null);
        }
      };
    });
  }
  // ---------------------------------------------------

  private handleChooseFromGallery = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        // Convert the file to a base64 string
        const base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = (e.target?.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(file);
        });

        // Get the location from the base64 image using the legacy EXIF method
        const location = await this.getImageLocationFromBase64(base64Data);

        this.props.onClose();
        this.props.onPhotoCapture({
          base64Data,
          location: location || undefined
        }, this.props.sit);
      };

      input.click();
    } catch (error) {
      console.error('Error choosing photo:', error);
      this.setState({ error: 'Error choosing photo' });
      this.showNotification('Error choosing photo', 'error');
    }
  };

  private handleTakePhoto = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        // Convert file to base64 string
        const base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = (e.target?.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(file);
        });

        // Get location from the base64 image
        const location = await this.getImageLocationFromBase64(base64Data);

        this.props.onClose();
        this.props.onPhotoCapture({
          base64Data,
          location: location || undefined
        }, this.props.sit);
      };

      input.click();
    } catch (error) {
      console.error('Error taking photo:', error);
      this.setState({ error: 'Error taking photo' });
      this.showNotification('Error taking photo', 'error');
    }
  };

  render() {
    const { isOpen, isUploading, onClose } = this.props;
    const { error } = this.state;

    console.log('PhotoUpload render:', { isOpen, isUploading, error });

    if (!isOpen) {
      console.log('PhotoUpload not open, returning null');
      return null;
    }

    return (
      <div className="modal-overlay active">
        <div className="photo-options">
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