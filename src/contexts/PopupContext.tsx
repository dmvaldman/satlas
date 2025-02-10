import { createContext, useContext, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Sit, Image, MarkType } from '../types';
import { useAuth } from './AuthContext';
import { useSits } from './SitsContext';
import { getDistanceInFeet } from '../types';
import { createRoot } from 'react-dom/client';
import { Carousel } from '../components/Carousel/Carousel';
import { useMarks } from './MarksContext';

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
  const { hasMark, getMarkCount, getMarks } = useMarks();

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
            console.log(action, imageId);
          }}
        />
        <div className="satlas-popup-info">
          {getMarkCount(sit.id, 'favorite') > 0 && (
            <p className="favorite-count-text">
              Favorited {getMarkCount(sit.id, 'favorite')}
              {getMarkCount(sit.id, 'favorite') === 1 ? ' time' : ' times'}
            </p>
          )}
          <div className="mark-buttons">
            {(['favorite', 'visited', 'wantToGo'] as MarkType[]).map(type => (
              <button
                key={type}
                className={`mark-button ${type}${hasMark(sit.id, type) ? ' active' : ''}`}
                data-sit-id={sit.id}
                data-mark-type={type}
              >
                {type === 'favorite' && (
                  <svg viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                )}
                {type === 'visited' && (
                  <svg viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                )}
                {type === 'wantToGo' && (
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                  </svg>
                )}
                {getMarkCount(sit.id, type) || ''}
              </button>
            ))}
          </div>
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