import { createContext, useContext, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useMap } from './MapContext';
import { useSits } from './SitsContext';
import { useAuth } from './AuthContext';

interface PhotoUploadContextType {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  takePhoto: () => Promise<string | null>;
  chooseFromGallery: () => Promise<string | null>;
}

const PhotoUploadContext = createContext<PhotoUploadContextType>({
  isModalOpen: false,
  openModal: () => {},
  closeModal: () => {},
  takePhoto: async () => null,
  chooseFromGallery: async () => null,
});

export const usePhotoUpload = () => useContext(PhotoUploadContext);

export const PhotoUploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { getCurrentLocation } = useMap();
  const { uploadSit } = useSits();
  const { isAuthenticated } = useAuth();

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const takePhoto = async (): Promise<string | null> => {
    if (!isAuthenticated) {
      // TODO: Add notification system
      console.error('Please sign in to add a sit');
      return null;
    }

    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64
      });
      if (!image.base64String) return null;

      const coordinates = await getCurrentLocation();
      await uploadSit(image.base64String, coordinates);

      return image.base64String;
    } catch (error) {
      console.error('Error taking photo:', error);
      return null;
    }
  };

  const chooseFromGallery = async (): Promise<string | null> => {
    if (!isAuthenticated) {
      // TODO: Add notification system
      console.error('Please sign in to add a sit');
      return null;
    }

    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos
      });
      if (!image.base64String) return null;

      const coordinates = await getCurrentLocation();
      await uploadSit(image.base64String, coordinates);

      return image.base64String;
    } catch (error) {
      console.error('Error choosing photo:', error);
      return null;
    }
  };

  return (
    <PhotoUploadContext.Provider
      value={{
        isModalOpen,
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