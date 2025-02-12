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
import { SitsProvider } from './SitsContext';

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
      anchor: 'bottom',
      className: 'satlas-popup-container'
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    root.render(<div className="satlas-popup-loading">Loading...</div>);
    popup.setDOMContent(container);

    getImagesForSit(sit.imageCollectionId).then(images => {
      if (!popup.isOpen()) return;

      root.render(
        <AuthProvider>
          <SitsProvider>
            <MarksProvider>
              <PhotoUploadProvider>
                <PopupContent
                  key={`${sit.id}-${Date.now()}`}
                  sit={sit}
                  images={images}
                  currentLocation={currentLocation}
                />
              </PhotoUploadProvider>
            </MarksProvider>
          </SitsProvider>
        </AuthProvider>
      );
    });

    return popup;
  }, [getImagesForSit]);

  const updatePopupContent = useCallback((
    popup: mapboxgl.Popup,
    sit: Sit,
    currentLocation: { latitude: number; longitude: number }
  ) => {
    const content = document.createElement('div');
    const root = createRoot(content);

    getImagesForSit(sit.imageCollectionId).then(images => {
      root.render(
        <AuthProvider>
          <SitsProvider>
            <MarksProvider>
              <PhotoUploadProvider>
                <PopupContent
                  sit={sit}
                  images={images}
                  currentLocation={currentLocation}
                />
              </PhotoUploadProvider>
            </MarksProvider>
          </SitsProvider>
        </AuthProvider>
      );
      popup.setDOMContent(content);
    });
  }, []);

  return (
    <PopupContext.Provider value={{ createPopup, updatePopupContent }}>
      {children}
    </PopupContext.Provider>
  );
};