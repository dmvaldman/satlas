import mapboxgl from 'mapbox-gl';
import { Sit, Coordinates } from './types';
import { getDistanceInFeet } from './types';
import { authManager } from './auth';
import { sitManager } from './sits';

export class PopupManager {
  createSitPopup(
    sit: Sit,
    marks: Set<MarkType>,
    markCounts: { [key: string]: number },
    currentLocation: Coordinates
  ): mapboxgl.Popup {
    const currentUser = authManager.getCurrentUser();
    const distance = getDistanceInFeet(currentLocation, sit.location);

    const popup = new mapboxgl.Popup({
      closeButton: false,
      maxWidth: '300px'
    });

    // Load initial popup content
    popup.setHTML(this.createLoadingPopupContent());

    // Get images and update popup content
    sitManager.getImagesForSit(sit.imageCollectionId).then(images => {
      const hasUserUploaded = images.some(img => img.userId === currentUser?.uid);
      // Update popup content with images
      popup.setHTML(this.createFullPopupContent(sit, images, marks, markCounts, distance, hasUserUploaded));
    });

    return popup;
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

  private createLoadingPopupContent(): string {
    return `
      <div class="satlas-popup">
        <div class="satlas-popup-loading">
          <p>Loading...</p>
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

  private createFullPopupContent(
    sit: Sit,
    images: Image[],
    marks: Set<MarkType>,
    markCounts: { [key: string]: number },
    distance: number,
    hasUserUploaded: boolean
  ): string {
    const isNearby = distance < 100;
    const currentUser = authManager.getCurrentUser();

    // Ensure sit.images exists and is an array
    const imagesArray = images || [];

    let content = `
      <div class="satlas-popup">
        <div class="image-carousel">
          <button class="carousel-prev" ${imagesArray.length <= 1 ? 'disabled' : ''}>←</button>
          <div class="carousel-container">
            ${imagesArray.map((image, index) => `
              <div class="carousel-slide ${index === 0 ? 'active' : ''}">
                <img src="${image.photoURL}" alt="Sit view" />
                ${image.userId === currentUser?.uid ? `
                  <div class="image-controls">
                    <button class="replace-photo" data-sit-id="${sit.id}" data-image-id="${image.id}">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                      </svg>
                    </button>
                    <button class="delete-photo" data-sit-id="${sit.id}" data-image-id="${image.id}">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                ` : ''}
                <p class="author">Posted by: ${image.userName}</p>
              </div>
            `).join('')}
          </div>
          <button class="carousel-next" ${imagesArray.length <= 1 ? 'disabled' : ''}>→</button>
        </div>
        <div class="satlas-popup-info">
          ${markCounts['favorite'] > 0 ?
            `<p class="favorite-count-text">Favorited ${markCounts['favorite']} ${markCounts['favorite'] === 1 ? 'time' : 'times'}</p>`
            : ''}
          ${hasUserUploaded ? `
            <button class="upload-button" data-sit-id="${sit.id}">
              Add Photo to this Sit
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Add mark buttons
    content += `
      <div class="mark-buttons">
        <button class="mark-button favorite${marks.has('favorite') ? ' active' : ''}" data-sit-id="${sit.id}" data-mark-type="favorite">
          <svg viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          ${markCounts['favorite'] || ''}
        </button>
        <button class="mark-button wantToGo${marks.has('wantToGo') ? ' active' : ''}" data-sit-id="${sit.id}" data-mark-type="wantToGo">
          <svg viewBox="0 0 24 24">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
          ${markCounts['wantToGo'] || ''}
        </button>
        <button class="mark-button visited${marks.has('visited') ? ' active' : ''}" data-sit-id="${sit.id}" data-mark-type="visited">
          <svg viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          ${markCounts['visited'] || ''}
        </button>
      </div>`;

    return content;
  }
}