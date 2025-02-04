import mapboxgl from 'mapbox-gl';
import { Sit, Coordinates } from './types';
import { getDistanceInFeet } from './types';

export class PopupManager {
  createSitPopup(sit: Sit, isFavorite: boolean, favoriteCount: number, userLocation?: Coordinates): mapboxgl.Popup {
    return new mapboxgl.Popup({
      offset: {
        'bottom': [0, -40],
        'top': [0, 0]
      },
      anchor: 'bottom'
    })
      .setHTML(this.createPopupHTML(sit, isFavorite, favoriteCount, userLocation));
  }

  createLoadingPopup(): mapboxgl.Popup {
    return new mapboxgl.Popup({
      offset: {
        'bottom': [0, -40],
        'top': [0, 0]
      },
      anchor: 'bottom'
    })
      .setHTML(this.createLoadingHTML());
  }

  createPopupContent(sit: Sit, isFavorite: boolean, favoriteCount: number, userLocation?: Coordinates): string {
    return this.createPopupHTML(sit, isFavorite, favoriteCount, userLocation);
  }

  private createPopupHTML(sit: Sit, isFavorite: boolean, favoriteCount: number, userLocation?: Coordinates): string {
    const isNearby = userLocation ?
      getDistanceInFeet(userLocation, sit.location) < 100 : false;

    // Ensure sit.images exists and is an array
    const images = sit.images || [];

    return `
      <div class="satlas-popup">
        <div class="image-carousel">
          <button class="carousel-prev" ${images.length <= 1 ? 'disabled' : ''}>←</button>
          <div class="carousel-container">
            ${images.map((image, index) => `
              <div class="carousel-slide ${index === 0 ? 'active' : ''}">
                <img src="${image.photoURL}" alt="Sit view" />
                <p class="author">Posted by: ${image.userName}</p>
              </div>
            `).join('')}
          </div>
          <button class="carousel-next" ${images.length <= 1 ? 'disabled' : ''}>→</button>
        </div>
        <div class="satlas-popup-info">
          ${favoriteCount > 0 ? `<p>Favorited ${favoriteCount} ${favoriteCount === 1 ? 'time' : 'times'}</p>` : ''}
          ${isNearby ? `
            <button class="upload-button" data-sit-id="${sit.id}">
              Add Photo to this Sit
            </button>
          ` : ''}
          <button class="favorite-button ${isFavorite ? 'active' : ''}" data-sit-id="${sit.id}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            ${isFavorite ? 'Favorited' : 'Favorite'}
          </button>
        </div>
      </div>
    `;
  }

  private createLoadingHTML(): string {
    return `
      <div class="satlas-popup">
        <div class="satlas-popup-loading">
          <p>Uploading...</p>
        </div>
      </div>
    `;
  }
}