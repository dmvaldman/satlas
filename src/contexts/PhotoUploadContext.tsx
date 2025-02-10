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

  // Add this helper function to convert DMS to decimal degrees
  const convertDMSToDD = (dms: number[], direction: string): number => {
    const degrees = dms[0];
    const minutes = dms[1];
    const seconds = dms[2];

    let dd = degrees + (minutes / 60) + (seconds / 3600);

    if (direction === 'S' || direction === 'W') {
      dd *= -1;
    }

    return dd;
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
              // Convert DMS to decimal degrees
              const latitude = convertDMSToDD(
                exifData.GPSLatitude,
                exifData.GPSLatitudeRef
              );
              const longitude = convertDMSToDD(
                exifData.GPSLongitude,
                exifData.GPSLongitudeRef
              );

              // Validate the converted coordinates
              if (
                !isNaN(latitude) &&
                !isNaN(longitude) &&
                latitude >= -90 &&
                latitude <= 90 &&
                longitude >= -180 &&
                longitude <= 180
              ) {
                resolve({ latitude, longitude });
              } else {
                console.warn('Invalid coordinates from EXIF:', { latitude, longitude });
                resolve(null);
              }
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
    // Add more detailed auth state logging
    console.log('Upload attempted. Auth state:', {
      isAuthenticated,
      user,
      userId: user?.uid
    });

    if (!isAuthenticated || !user) {
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

      // Add logging before upload
      console.log('Starting upload with:', {
        coordinates,
        userId: user.uid,
        isAuthenticated
      });

      await uploadSit(base64Image, coordinates);
      showNotification('Sit uploaded successfully!', 'success');
      closeModal();
    } catch (error) {
      console.error('Error uploading sit:', error, {
        authState: { isAuthenticated, userId: user?.uid }
      });
      showNotification('Error uploading sit', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const takePhoto = async () => {
    try {
      closeModal(); // Close modal immediately after selection
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
    }
  };

  const chooseFromGallery = async () => {
    try {
      closeModal(); // Close modal immediately after selection
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