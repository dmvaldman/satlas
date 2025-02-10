import { createContext, useContext, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useMap } from './MapContext';
import { useSits } from './SitsContext';
import { useAuth } from './AuthContext';

interface PhotoUploadContextType {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  takePhoto: () => Promise<void>;
  choosePhoto: () => Promise<void>;
  isUploading: boolean;
}

const PhotoUploadContext = createContext<PhotoUploadContextType>({
  isModalOpen: false,
  openModal: () => {},
  closeModal: () => {},
  takePhoto: async () => {},
  choosePhoto: async () => {},
  isUploading: false,
});

export const usePhotoUpload = () => useContext(PhotoUploadContext);

export const PhotoUploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { getCurrentLocation } = useMap();
  const { uploadSit } = useSits();
  const { isAuthenticated } = useAuth();

  const handlePhotoCapture = async (source: CameraSource) => {
    if (!isAuthenticated) {
      // TODO: Add notification system
      console.error('Please sign in to add a sit');
      return;
    }

    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source,
      });

      if (!image.base64String) return;

      setIsUploading(true);
      const coordinates = await getCurrentLocation();
      await uploadSit(image.base64String, coordinates);

      setIsModalOpen(false);
    } catch (error) {
      console.error('Error capturing photo:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <PhotoUploadContext.Provider
      value={{
        isModalOpen,
        openModal: () => setIsModalOpen(true),
        closeModal: () => setIsModalOpen(false),
        takePhoto: () => handlePhotoCapture(CameraSource.Camera),
        choosePhoto: () => handlePhotoCapture(CameraSource.Photos),
        isUploading,
      }}
    >
      {children}
    </PhotoUploadContext.Provider>
  );
};