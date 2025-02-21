import React from 'react';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';

// For Vite env types
declare global {
  interface ImportMetaEnv {
    VITE_LEGACY_SUPPORT: string;
  }
}

/// <reference types="vite/client" />

interface PhotoUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCapture: (result: PhotoResult) => Promise<void>;
  replaceInfo: { sitId: string; imageId: string; } | null;
  isUploading?: boolean;
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
    // Only keep if absolutely necessary for legacy code
    if (import.meta.env.VITE_LEGACY_SUPPORT === 'true') {
      window.addEventListener('openPhotoUploadModal', this.handleGlobalOpen as EventListener);
    }
  }

  componentWillUnmount() {
    if (import.meta.env.VITE_LEGACY_SUPPORT === 'true') {
      window.removeEventListener('openPhotoUploadModal', this.handleGlobalOpen as EventListener);
    }
  }

  /** @deprecated Use props for modal control instead */
  private handleGlobalOpen = (event: Event) => {
    const customEvent = event as CustomEvent<{ sitId: string; imageId: string }>;
    this.props.onClose(); // Reset current state
    this.props.onPhotoCapture(customEvent.detail.sitId);
  };

  private showNotification(message: string, type: 'success' | 'error') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  private async extractExifLocation(photo: Photo): Promise<Coordinates | null> {
    if (photo.exif) {
      const { GPSLatitude, GPSLongitude } = photo.exif;
      if (GPSLatitude && GPSLongitude) {
        return {
          latitude: GPSLatitude,
          longitude: GPSLongitude
        };
      }
    }
    return null;
  }

  private handleTakePhoto = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: true,
        correctOrientation: true,
        // Request EXIF data
        exifData: true
      });

      if (image.base64String) {
        const location = await this.extractExifLocation(image);
        this.props.onClose();
        await this.props.onPhotoCapture({
          base64Data: image.base64String,
          location
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled photos app') {
        console.error('Error taking photo:', error);
        this.setState({ error: 'Error taking photo' });
        this.showNotification('Error taking photo', 'error');
      }
    }
  };

  private handleChooseFromGallery = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos
      });

      if (image.base64String) {
        this.props.onClose();
        await this.props.onPhotoCapture(image.base64String);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled photos app') {
        console.error('Error choosing photo:', error);
        this.setState({ error: 'Error choosing photo' });
        this.showNotification('Error choosing photo', 'error');
      }
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