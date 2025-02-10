import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useMap } from './MapContext';
import { useSits } from './SitsContext';
import { useAuth } from './AuthContext';
import { Coordinates } from '../types';
import { useMarkers } from '../contexts/MarkerContext';
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
  const { createPendingMarker, updateMarker, removeMarker, createMarker, markers } = useMarkers();
  const { map } = useMap();

  // Add an effect to watch state changes
  useEffect(() => {
    console.log('isModalOpen state changed:', isModalOpen);
  }, [isModalOpen]);

  const openModal = useCallback((info?: { sitId: string; imageId: string }) => {
    console.log('openModal called with:', info);
    setReplaceInfo(info || null);
    setIsModalOpen(true);
    console.log('Modal state after open:', { isModalOpen: true, replaceInfo: info || null });
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
    console.log('handlePhotoUpload called:', {
      isAuthenticated,
      hasUser: !!user,
      hasReplaceInfo: !!replaceInfo,
      replaceInfo
    });

    if (!isAuthenticated || !user) {
      showNotification('Please sign in to add a sit', 'error');
      return;
    }

    setIsUploading(true);

    try {
      if (replaceInfo) {
        console.log('Attempting to replace photo:', replaceInfo);
        await replaceImage(replaceInfo.sitId, replaceInfo.imageId, base64Image);
        console.log('Photo replacement successful');
        showNotification('Photo replaced successfully!', 'success');
      } else {
        // Handle new upload
        let sitId = `sit_${Date.now()}`;

        // Get location first
        let coordinates = await getImageLocation(base64Image);
        if (!coordinates) {
          coordinates = await getCurrentLocation();
        }

        // Create initial sit with location and user info
        const initialSit = {
          id: sitId,
          location: coordinates,
          imageCollectionId: `${Date.now()}_${user.uid}`,
          uploadedBy: user.uid,
          createdAt: new Date(),
        };

        // Create marker immediately
        if (map) {
          const marker = createMarker(initialSit);
          marker.addTo(map);

          // Show uploading state in popup
          const loadingPopup = new mapboxgl.Popup({ closeButton: false })
            .setHTML('<div class="satlas-popup-loading"><p>Uploading photo...</p></div>');
          marker.setPopup(loadingPopup);
        }

        // Perform actual upload
        const completeSit = await uploadSit(base64Image, coordinates);

        // Update marker with complete sit data (including photo)
        if (map) {
          const marker = markers.get(sitId);
          if (marker && coordinates) {
            const popupContent = `
              <div class="satlas-popup">
                <h3>${completeSit.name}</h3>
                <p>Uploaded by: ${completeSit.uploadedBy}</p>
                <p>Uploaded at: ${new Date(completeSit.createdAt).toLocaleString()}</p>
              </div>
            `;
            marker.setPopup(new mapboxgl.Popup({ closeButton: false }).setHTML(popupContent));
          }
        }

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

  const takePhoto = async () => {
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
        closeModal();
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled photos app') {
        console.error('Error choosing photo:', error);
        showNotification('Error choosing photo', 'error');
      }
    }
  };

  // Add this log to see what value we're providing
  const value = {
    isModalOpen,
    isUploading,
    openModal,
    closeModal,
    takePhoto,
    chooseFromGallery,
  };

  console.log('Creating PhotoUploadContext value:', value);

  return (
    <PhotoUploadContext.Provider value={value}>
      {console.log('PhotoUploadContext rendering with:', { isModalOpen, isUploading })}
      {children}
    </PhotoUploadContext.Provider>
  );
};