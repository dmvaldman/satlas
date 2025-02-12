import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useMap } from './MapContext';
import { useSits } from './SitsContext';
import { useAuth } from './AuthContext';
import { Coordinates } from '../types';
import * as mapboxgl from 'mapbox-gl';

interface PhotoUploadContextType {
  isModalOpen: boolean;
  isUploading: boolean;
  openModal: (replaceInfo?: { sitId: string; imageId: string }) => void;
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
  const [replaceInfo, setReplaceInfo] = useState<{ sitId: string; imageId: string } | null>(null);
  const { getCurrentLocation } = useMap();
  const { uploadSit, findNearbySit, replaceImage } = useSits();
  const { isAuthenticated, user } = useAuth();

  const openModal = useCallback((info?: { sitId: string; imageId: string }) => {
    setReplaceInfo(info || null);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setReplaceInfo(null);
  }, []);

  const showNotification = (message: string, type: 'success' | 'error') => {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };

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
    if (!isAuthenticated || !user) {
      showNotification('Please sign in to add a sit', 'error');
      return;
    }

    setIsUploading(true);

    try {
      if (replaceInfo) {
        await replaceImage(replaceInfo.sitId, replaceInfo.imageId, base64Image);
        showNotification('Photo replaced successfully!', 'success');
      } else {
        // Get location first
        let coordinates = await getImageLocation(base64Image);
        if (!coordinates) {
          coordinates = await getCurrentLocation();
        }

        // Perform actual upload - let SitsContext handle the sit creation
        const completeSit = await uploadSit(base64Image, coordinates);

        showNotification('Sit uploaded successfully!', 'success');
      }
    } catch (error) {
      console.error('Error handling photo:', error);
      showNotification('Error uploading photo', 'error');
    } finally {
      setIsUploading(false);
      setReplaceInfo(null);
    }
  };

  const takePhoto = useCallback(async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64
      });

      if (image.base64String) {
        await handlePhotoUpload(image.base64String);
        closeModal();
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled photos app') {
        console.error('Error taking photo:', error);
        showNotification('Error taking photo', 'error');
      }
    }
  }, [handlePhotoUpload, closeModal]);

  const chooseFromGallery = useCallback(async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos
      });

      if (image.base64String) {
        await handlePhotoUpload(image.base64String);
        closeModal();
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled photos app') {
        console.error('Error choosing photo:', error);
        showNotification('Error choosing photo', 'error');
      }
    }
  }, [handlePhotoUpload, closeModal]);

  // Add this effect to listen for the global event to open the modal
  useEffect(() => {
    const handleGlobalOpenEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ sitId: string, imageId: string }>;
      console.log('Received global open photo upload event:', customEvent.detail);
      setReplaceInfo(customEvent.detail);
      setIsModalOpen(true);
    };
    window.addEventListener('openPhotoUploadModal', handleGlobalOpenEvent as EventListener);
    return () => {
      window.removeEventListener('openPhotoUploadModal', handleGlobalOpenEvent as EventListener);
    };
  }, []);

  const value = useMemo(() => {
    return {
      isModalOpen,
      isUploading,
      openModal,
      closeModal,
      takePhoto,
      chooseFromGallery,
    };
  }, [isModalOpen, isUploading, openModal, closeModal, takePhoto, chooseFromGallery]);

  return (
    <PhotoUploadContext.Provider value={value}>
      {children}
    </PhotoUploadContext.Provider>
  );
};