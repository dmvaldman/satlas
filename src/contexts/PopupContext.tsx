import { createContext, useContext, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Sit, Image } from '../types';
import { useAuth } from './AuthContext';
import { useSits } from './SitsContext';
import { getDistanceInFeet } from '../types';
import { createRoot } from 'react-dom/client';
import { Carousel } from '../components/Carousel/Carousel';

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

  const createPopupContent = (
    sit: Sit,
    images: Image[],
    currentLocation: { latitude: number; longitude: number }
  ): HTMLElement => {
    const container = document.createElement('div');
    container.className = 'satlas-popup';

    const root = createRoot(container);
    root.render(
      <div className="satlas-popup">
        <Carousel
          images={images}
          sitId={sit.id}
          onImageAction={(action, imageId) => {
            // Handle image actions
            console.log(action, imageId);
          }}
        />
        <div className="satlas-popup-info">
          {/* Add other popup content */}
        </div>
      </div>
    );

    return container;
  };

  const createPopup = (
    sit: Sit,
    currentLocation: { latitude: number; longitude: number }
  ): mapboxgl.Popup => {
    const popup = new mapboxgl.Popup({
      closeButton: false,
      maxWidth: '300px',
      className: 'satlas-popup-container'
    });

    // Set initial loading state
    const loadingContainer = document.createElement('div');
    loadingContainer.innerHTML = `
      <div class="satlas-popup">
        <div class="satlas-popup-loading">
          <p>Loading...</p>
        </div>
      </div>
    `;
    popup.setDOMContent(loadingContainer);

    // Load images and update content
    getImagesForSit(sit.imageCollectionId).then(images => {
      const content = createPopupContent(sit, images, currentLocation);
      popup.setDOMContent(content);
    });

    return popup;
  };

  const updatePopupContent = (
    popup: mapboxgl.Popup,
    sit: Sit,
    currentLocation: { latitude: number; longitude: number }
  ) => {
    getImagesForSit(sit.imageCollectionId).then(images => {
      const content = createPopupContent(sit, images, currentLocation);
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