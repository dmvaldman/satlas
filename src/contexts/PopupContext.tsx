import { createContext, useContext, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Sit, Image, MarkType } from '../types';
import { useAuth } from './AuthContext';
import { useSits } from './SitsContext';
import { getDistanceInFeet } from '../types';
import { createRoot } from 'react-dom/client';
import { Carousel } from '../components/Carousel/Carousel';
import { useMarks } from './MarksContext';
import { PopupContent } from '../components/Popup/PopupContent';
import { MarksProvider } from './MarksContext';
import { AuthProvider } from './AuthContext';
import { PhotoUploadProvider } from './PhotoUploadContext';

interface PopupContextType {
  createPopup: (sit: Sit, currentLocation: { latitude: number; longitude: number }) => mapboxgl.Popup;
  updatePopupContent: (popup: mapboxgl.Popup, sit: Sit, currentLocation: { latitude: number; longitude: number }) => void;
}

const PopupContext = createContext<PopupContextType>({
  createPopup: () => new mapboxgl.Popup(),
  updatePopupContent: () => {},
});

export const usePopups = () => useContext(PopupContext);

export const PopupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { getImagesForSit } = useSits();
  const { hasMark, getMarkCount, getMarks, toggleMark } = useMarks();

  const createPopup = useCallback((sit: Sit, currentLocation: { latitude: number; longitude: number }): mapboxgl.Popup => {
    const popup = new mapboxgl.Popup({
      closeButton: false,
      maxWidth: '300px',
      offset: 25,
      anchor: 'bottom'
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    const renderContent = (images: Image[]) => {
      root.render(
        <AuthProvider>
          <MarksProvider>
            <PopupContent
              key={`${sit.id}-${Date.now()}`}
              sit={sit}
              images={images}
              currentLocation={currentLocation}
            />
          </MarksProvider>
        </AuthProvider>
      );
    };

    // Show loading state initially
    root.render(<div className="satlas-popup-loading">Loading...</div>);
    popup.setDOMContent(container);

    // Load images and render full content
    getImagesForSit(sit.imageCollectionId).then(images => {
      renderContent(images);
    });

    // Listen for mark updates
    popup.on('open', () => {
      // Re-render content when popup opens
      getImagesForSit(sit.imageCollectionId).then(renderContent);
    });

    return popup;
  }, [getImagesForSit]);

  const updatePopupContent = (
    popup: mapboxgl.Popup,
    sit: Sit,
    currentLocation: { latitude: number; longitude: number }
  ) => {
    getImagesForSit(sit.imageCollectionId).then(images => {
      const content = document.createElement('div');
      const root = createRoot(content);
      root.render(
        <AuthProvider>
          <MarksProvider>
            <PopupContent
              sit={sit}
              images={images}
              currentLocation={currentLocation}
            />
          </MarksProvider>
        </AuthProvider>
      );
      popup.setDOMContent(content);
    });
  };

  return (
    <PopupContext.Provider
      value={{
        createPopup,
        updatePopupContent,
      }}
    >
      {children}
    </PopupContext.Provider>
  );
};