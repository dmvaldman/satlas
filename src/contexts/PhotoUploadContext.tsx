import { createContext, useContext, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useMap } from './MapContext';
import { useSits } from './SitsContext';
import { useAuth } from './AuthContext';
import { Coordinates } from '../types';

interface PhotoUploadContextType {
  isModalOpen: boolean;
  isUploading: boolean;
  openModal: () => void;
  closeModal: () => void;
  takePhoto: () => Promise<void>;
  chooseFromGallery: () => Promise<void>;
}

const PhotoUploadContext = createContext<PhotoUploadContextType>({
  isModalOpen: false,
  isUploading: false,
  openModal: () => {},
  closeModal: () => {},
  takePhoto: async () => {},
  chooseFromGallery: async () => {},
});

export const usePhotoUpload = () => useContext(PhotoUploadContext);

export const PhotoUploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { getCurrentLocation } = useMap();
  const { uploadSit, findNearbySit } = useSits();
  const { isAuthenticated, user } = useAuth();

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const showNotification = (message: string, type: 'success' | 'error') => {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };

  const getImageLocation = async (base64Image: string): Promise<Coordinates | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${base64Image}`;

      img.onload = () => {
        try {
          // @ts-ignore - EXIF is loaded globally
          EXIF.getData(img, function() {
            // @ts-ignore - EXIF is loaded globally
            const exifData = EXIF.getAllTags(this);
            if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
              resolve({
                latitude: exifData.GPSLatitude,
                longitude: exifData.GPSLongitude
              });
            } else {
              resolve(null);
            }
          });
        } catch (error) {
          console.error('Error reading EXIF data:', error);
          resolve(null);
        }
      };
    });
  };

  const handlePhotoUpload = async (base64Image: string) => {
    if (!isAuthenticated) {
      showNotification('Please sign in to add a sit', 'error');
      return;
    }

    setIsUploading(true);
    try {
      // Try to get location from image first
      let coordinates = await getImageLocation(base64Image);

      // If no location in image, use current location
      if (!coordinates) {
        coordinates = await getCurrentLocation();
      }

      await uploadSit(base64Image, coordinates);
      showNotification('Sit uploaded successfully!', 'success');
      closeModal();
    } catch (error) {
      console.error('Error uploading sit:', error);
      showNotification('Error uploading sit', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const takePhoto = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64
      });

      if (image.base64String) {
        await handlePhotoUpload(image.base64String);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled photos app') {
        console.error('Error taking photo:', error);
        showNotification('Error taking photo', 'error');
      }
      closeModal();
    }
  };

  const chooseFromGallery = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos
      });

      if (image.base64String) {
        await handlePhotoUpload(image.base64String);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled photos app') {
        console.error('Error choosing photo:', error);
        showNotification('Error choosing photo', 'error');
      }
      closeModal();
    }
  };

  return (
    <PhotoUploadContext.Provider
      value={{
        isModalOpen,
        isUploading,
        openModal,
        closeModal,
        takePhoto,
        chooseFromGallery,
      }}
    >
      {children}
    </PhotoUploadContext.Provider>
  );
};