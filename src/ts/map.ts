import { Geolocation } from '@capacitor/geolocation';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import mapboxgl from 'mapbox-gl';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { storage } from './firebase';
import { authManager } from './auth';
import { getAuth } from 'firebase/auth';
import { MarkerManager } from './markers';
import { PopupManager } from './popups';
import { FavoritesManager } from './favorites';
import { SitManager } from './sits';
import { Coordinates } from './types';

// Replace with your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZG12YWxkbWFuIiwiYSI6ImNpbXRmNXpjaTAxem92OWtrcHkxcTduaHEifQ.6sfBuE2sOf5bVUU6cQJLVQ';

interface Sit {
  id: string;
  location: {
    latitude: number;
    longitude: number;
  };
  photoURL: string;
  userId: string;
  userName: string;
  createdAt: Date;
}

// Add EXIF extraction function
async function getImageLocation(base64String: string): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      // Create canvas to strip EXIF but keep GPS
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Try to extract GPS data before stripping EXIF
      EXIF.getData(img as any, function() {
        const exif = EXIF.getAllTags(this);

        if (exif?.GPSLatitude && exif?.GPSLongitude) {
          const latitude = convertDMSToDD(exif.GPSLatitude, exif.GPSLatitudeRef);
          const longitude = convertDMSToDD(exif.GPSLongitude, exif.GPSLongitudeRef);

          if (isValidCoordinate(latitude, longitude)) {
            resolve({ latitude, longitude });
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    };

    // Properly format the base64 string as a data URL if it isn't already
    if (!base64String.startsWith('data:')) {
      img.src = `data:image/jpeg;base64,${base64String}`;
    } else {
      img.src = base64String;
    }
  });
}

// Convert GPS coordinates from Degrees Minutes Seconds to Decimal Degrees
function convertDMSToDD(dms: number[], dir: string): number {
  const degrees = dms[0];
  const minutes = dms[1];
  const seconds = dms[2];

  let dd = degrees + (minutes / 60) + (seconds / 3600);

  if (dir === 'S' || dir === 'W') {
    dd *= -1;
  }

  return dd;
}

// Validate coordinates
function isValidCoordinate(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) &&
         lat >= -90 && lat <= 90 &&
         lng >= -180 && lng <= 180;
}

// Strip EXIF data but keep the image
function stripExif(base64String: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64String);
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };

    // Properly format the base64 string as a data URL if it isn't already
    if (!base64String.startsWith('data:')) {
      img.src = `data:image/jpeg;base64,${base64String}`;
    } else {
      img.src = base64String;
    }
  });
}

export class MapManager {
  private map!: mapboxgl.Map;  // Use definite assignment
  private auth = getAuth();
  private markerManager!: MarkerManager;
  private popupManager!: PopupManager;
  private favoritesManager!: FavoritesManager;
  private sitManager!: SitManager;

  constructor() {
    console.log('MapManager initialized');
    this.initializeMap().then(() => {
      // Initialize managers after map is ready
      this.markerManager = new MarkerManager(this.map);
      this.popupManager = new PopupManager();
      this.favoritesManager = new FavoritesManager();
      this.sitManager = new SitManager();

      this.setupEventListeners();
      this.setupAuthListener();
      this.setupFavoriteClickListener();

      // Load initial sits
      this.loadNearbySits();
    });
  }

  private setupEventListeners() {
    const addButton = document.getElementById('add-satlas-btn');
    const modal = document.getElementById('photo-modal');
    const takePhotoBtn = document.getElementById('take-photo');
    const choosePhotoBtn = document.getElementById('choose-photo');
    const cancelBtn = document.getElementById('cancel-photo');

    if (addButton && modal) {
      addButton.addEventListener('click', () => {
        if (!authManager.isAuthenticated()) {
          this.showNotification('Please sign in to add a sit', 'error');
          return;
        }
        modal.classList.add('active');
      });
    }

    if (takePhotoBtn) {
      takePhotoBtn.addEventListener('click', () => {
        this.capturePhoto();
        modal?.classList.remove('active');
      });
    }

    if (choosePhotoBtn) {
      choosePhotoBtn.addEventListener('click', () => {
        this.selectPhoto();
        modal?.classList.remove('active');
      });
    }

    if (cancelBtn && modal) {
      cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }
  }

  private async initializeMap() {
    try {
      console.log('Initializing map...');
      const coordinates = await this.getCurrentLocation();
      console.log('Got coordinates:', coordinates);

      this.map = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 13
      });

      return new Promise<void>((resolve) => {
        this.map.on('load', () => {
          console.log('Map loaded');

          // Add movement listener
          this.map.on('moveend', () => {
            this.loadNearbySits();
          });

          resolve();
        });
      });
    } catch (error) {
      console.error('Error initializing map:', error);
      this.initializeMapWithDefaultLocation();
    }
  }

  private async getCurrentLocation() {
    try {
      const position = await Geolocation.getCurrentPosition();
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    } catch (error) {
      console.error('Error getting location:', error);
      // Default to NYC coordinates
      return {
        latitude: 40.7128,
        longitude: -74.006
      };
    }
  }

  private initializeMapWithDefaultLocation() {
    console.log('Initializing map with default location');
    const container = document.getElementById('map-container');
    if (!container) {
      console.error('Could not find map container');
      return;
    }

    this.map = new mapboxgl.Map({
      container: 'map-container',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-74.006, 40.7128], // Default to NYC
      zoom: 13
    });
  }

  private async loadNearbySits() {
    if (!this.map) return;
    const bounds = this.map.getBounds();
    if (!bounds) return;

    const sits = await this.sitManager.loadNearbySits({
      north: bounds.getNorth(),
      south: bounds.getSouth()
    });

    const newSitIds = sits
      .filter(sit => !this.markerManager.has(sit.id))
      .map(sit => sit.id);

    if (newSitIds.length > 0) {
      await this.favoritesManager.loadFavoritesCounts(newSitIds);
    }

    sits.forEach(sit => {
      if (!this.markerManager.has(sit.id)) {
        const isOwnSit = sit.userId === this.auth.currentUser?.uid;
        const isFavorite = this.favoritesManager.isFavorite(sit.id);
        const favoriteCount = this.favoritesManager.getFavoriteCount(sit.id);

        const marker = this.markerManager.createMarker(sit, isOwnSit, isFavorite);
        const popup = this.popupManager.createSitPopup(sit, isFavorite, favoriteCount);

        marker.setPopup(popup);
        this.markerManager.set(sit.id, marker);

        console.log('Initial marker position:', sit.id, marker.getLngLat());
      }
    });
  }

  private async capturePhoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera
      });

      if (image.base64String) {
        await this.handlePhotoCapture(image.base64String);
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
    }
  }

  private async selectPhoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos
      });

      if (image.base64String) {
        await this.handlePhotoCapture(image.base64String);
      }
    } catch (error) {
      console.error('Error selecting photo:', error);
    }
  }

  private async handlePhotoCapture(base64Image: string) {
    if (!authManager.isAuthenticated()) {
      this.showNotification('Please sign in to add a sit', 'error');
      return;
    }

    let tempMarker: mapboxgl.Marker | null = null;
    let tempMarkerId: string | null = null;

    try {
      // Get location first
      const exifLocation = await getImageLocation(base64Image);
      console.log('EXIF Location:', exifLocation);
      const coordinates = exifLocation || await this.getCurrentLocation();
      console.log('Final coordinates:', coordinates);

      // Create temporary marker immediately
      if (this.map) {
        const el = document.createElement('div');
        el.className = 'satlas-marker pending';

        tempMarker = new mapboxgl.Marker(el)
          .setLngLat([coordinates.longitude, coordinates.latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 })
              .setHTML(`
                <div class="satlas-popup">
                  <div class="satlas-popup-loading">
                    <p>Uploading...</p>
                  </div>
                </div>
              `)
          )
          .addTo(this.map);

        // Generate a temporary ID
        tempMarkerId = `temp_${Date.now()}`;
        this.markerManager.set(tempMarkerId, tempMarker);
      }

      // Strip EXIF data from image
      const strippedImage = await stripExif(base64Image);

      // Create a unique filename using timestamp
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);

      // Upload the stripped image
      const base64WithoutPrefix = strippedImage.replace(/^data:image\/\w+;base64,/, '');
      await uploadString(storageRef, base64WithoutPrefix, 'base64');
      const photoURL = await getDownloadURL(storageRef);

      const currentUser = authManager.getCurrentUser();
      const sitData = {
        location: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude
        },
        photoURL,
        userId: currentUser?.uid || 'anonymous',
        userName: currentUser?.displayName || 'Anonymous',
        userPhotoURL: currentUser?.photoURL || null,
        createdAt: serverTimestamp()
      };

      // Add to Firestore
      const docRef = await addDoc(collection(db, 'sits'), sitData);
      const sitId = docRef.id;

      // Update the temporary marker to be permanent
      if (tempMarker && tempMarkerId) {
        const el = tempMarker.getElement();
        el.classList.remove('pending');

        // Add own-sit class since this is a new upload by the current user
        el.className = 'satlas-marker own-sit';

        tempMarker.setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div class="satlas-popup">
                <img src="${photoURL}" alt="Sit view" />
                <div class="satlas-popup-info">
                  <p class="author">Posted by: ${currentUser?.displayName || 'Anonymous'}</p>
                </div>
              </div>
            `)
        );

        // Store sit data with marker
        (tempMarker as any).sit = {
          id: sitId,
          ...sitData
        };

        // Update marker tracking with permanent ID
        this.markerManager.delete(tempMarkerId);
        this.markerManager.set(sitId, tempMarker);
      }

    } catch (error) {
      console.error('Error handling photo capture:', error);

      // Remove temporary marker if it exists
      if (tempMarker && tempMarkerId) {
        tempMarker.remove();
        this.markerManager.delete(tempMarkerId);
      }

      this.showNotification('Error uploading sit', 'error');
    }
  }

  private showNotification(message: string, type: 'success' | 'error' = 'success') {
    // Add notification element to DOM
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  private setupAuthListener() {
    this.auth.onAuthStateChanged((user) => {
      this.favoritesManager.loadUserFavorites(user?.uid || null).then(() => {
        this.refreshMarkers();
      });
    });
  }

  private async refreshMarkers() {
    const markers = this.markerManager.getAll();
    for (const [sitId, marker] of markers) {
      const sit = (marker as any).sit;
      const isOwnSit = sit.userId === this.auth.currentUser?.uid;
      const isFavorite = this.favoritesManager.isFavorite(sitId);

      this.markerManager.updateMarkerStyle(marker, isOwnSit, isFavorite);

      const popup = marker.getPopup();
      const favoriteCount = this.favoritesManager.getFavoriteCount(sitId);
      popup.setHTML(this.popupManager.createPopupContent(sit, isFavorite, favoriteCount));
    }
  }

  private setupFavoriteClickListener() {
    // Use event delegation on the map container
    document.getElementById('map-container')?.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const favoriteButton = target.closest('.favorite-button') as HTMLElement;
      if (!favoriteButton) return;

      const sitId = favoriteButton.dataset.sitId;
      if (!sitId) return;

      await this.handleFavoriteClick(sitId);

      // Update just this popup
      const marker = this.markerManager.get(sitId);
      if (marker) {
        const sit = (marker as any).sit;
        const isFavorite = this.favoritesManager.isFavorite(sitId);
        const favoriteCount = this.favoritesManager.getFavoriteCount(sitId);
        marker.getPopup().setHTML(this.popupManager.createPopupContent(sit, isFavorite, favoriteCount));
      }
    });
  }

  private async handleFavoriteClick(sitId: string) {
    if (!this.auth.currentUser) {
      this.showNotification('Please sign in to favorite sits', 'error');
      return;
    }

    const marker = this.markerManager.get(sitId);
    if (!marker) return;

    const sit = (marker as any).sit;
    const success = await this.favoritesManager.toggleFavorite(sitId, this.auth.currentUser.uid);

    if (success) {
      const isFavorite = this.favoritesManager.isFavorite(sitId);
      const favoriteCount = this.favoritesManager.getFavoriteCount(sitId);

      // Update marker and popup
      this.markerManager.updateMarkerStyle(marker, sit.userId === this.auth.currentUser.uid, isFavorite);
      marker.getPopup().setHTML(this.popupManager.createPopupContent(sit, isFavorite, favoriteCount));
    } else {
      this.showNotification('Error updating favorite', 'error');
    }
  }
}

// Initialize the map when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing MapManager');
  new MapManager();
});