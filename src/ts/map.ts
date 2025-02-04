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

class MapManager {
  private map: mapboxgl.Map | null = null;
  private markers: Map<string, mapboxgl.Marker> = new Map();
  private loadedSitIds: Set<string> = new Set();
  private userFavorites: Set<string> = new Set();
  private auth = getAuth();
  private favoritesCounts: Map<string, number> = new Map();

  constructor() {
    console.log('MapManager initialized');
    this.initializeMap();
    this.setupEventListeners();

    // Add auth state listener
    this.auth.onAuthStateChanged((user) => {
      this.loadUserFavorites().then(() => {
        // Refresh all markers with updated favorites
        this.refreshMarkers();
      });
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

      const container = document.getElementById('map-container');
      if (!container) {
        throw new Error('Could not find map container');
      }

      this.map = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 13
      });

      this.map.on('load', () => {
        console.log('Map loaded');
        this.loadNearbySatlases(coordinates);
      });

      this.map.on('error', (e) => {
        console.error('Mapbox error:', e);
      });

      // Update markers when map moves
      this.map.on('moveend', () => {
        const center = this.map.getCenter();
        this.loadNearbySatlases({
          latitude: center.lat,
          longitude: center.lng
        });
      });

    } catch (error) {
      console.error('Error initializing map:', error);
      // Fall back to a default location if geolocation fails
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

  private async loadNearbySatlases(center: { latitude: number; longitude: number }) {
    if (!this.map) {
      console.error('Map not initialized');
      return;
    }

    // Get the visible bounds of the map
    const bounds = this.map.getBounds();
    const visibleSitIds = new Set<string>();

    try {
      // Query Firebase for sits within the visible bounds
      const sitsRef = collection(db, 'sits');
      const q = query(
        sitsRef,
        where('location.latitude', '>=', bounds.getSouth()),
        where('location.latitude', '<=', bounds.getNorth())
      );

      const querySnapshot = await getDocs(q);
      console.log('Found sits:', querySnapshot.size);

      const newSitIds: string[] = [];
      querySnapshot.forEach((doc) => {
        const sitId = doc.id;
        visibleSitIds.add(sitId);

        if (!this.loadedSitIds.has(sitId)) {
          const sit = { ...doc.data(), id: sitId } as Sit;
          newSitIds.push(sitId);

          const el = document.createElement('div');
          el.className = `satlas-marker${this.userFavorites.has(sitId) ? ' favorite' : ''}`;

          const popup = new mapboxgl.Popup({ offset: 25 })
            .setHTML(this.createMarkerPopup(sit));

          const marker = new mapboxgl.Marker(el)
            .setLngLat([sit.location.longitude, sit.location.latitude])
            .setPopup(popup)
            .addTo(this.map!);

          // Store sit data with marker
          (marker as any).sit = sit;

          this.setupPopupEventListeners(popup, sitId);
          this.markers.set(sitId, marker);
          this.loadedSitIds.add(sitId);
        }
      });

      // Load favorites counts for new sits
      if (newSitIds.length > 0) {
        await this.loadFavoritesCounts(newSitIds);
      }

      // Remove markers that are no longer visible
      for (const [sitId, marker] of this.markers.entries()) {
        if (!visibleSitIds.has(sitId)) {
          marker.remove();
          this.markers.delete(sitId);
          this.loadedSitIds.delete(sitId);
        }
      }

    } catch (error) {
      console.error('Error loading sits:', error);
    }
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
        this.markers.set(tempMarkerId, tempMarker);
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

        // Update marker tracking with permanent ID
        this.markers.delete(tempMarkerId);
        this.markers.set(sitId, tempMarker);
        this.loadedSitIds.add(sitId);
      }

    } catch (error) {
      console.error('Error handling photo capture:', error);

      // Remove temporary marker if it exists
      if (tempMarker && tempMarkerId) {
        tempMarker.remove();
        this.markers.delete(tempMarkerId);
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

  private async loadUserFavorites(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      this.userFavorites.clear();
      return;
    }

    try {
      const favoritesRef = collection(db, 'favorites');
      const q = query(favoritesRef, where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);

      this.userFavorites.clear();
      querySnapshot.forEach((doc) => {
        this.userFavorites.add(doc.data().sitId);
      });
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  }

  private async toggleFavorite(sitId: string) {
    const user = this.auth.currentUser;
    if (!user) {
      this.showNotification('Please sign in to favorite sits', 'error');
      return;
    }

    try {
      const favoriteId = `${user.uid}_${sitId}`;
      const favoriteRef = doc(db, 'favorites', favoriteId);
      const isFavorite = this.userFavorites.has(sitId);

      if (isFavorite) {
        await deleteDoc(favoriteRef);
        this.userFavorites.delete(sitId);
      } else {
        await setDoc(favoriteRef, {
          userId: user.uid,
          sitId: sitId,
          createdAt: serverTimestamp()
        });
        this.userFavorites.add(sitId);
      }

      // Update favorites count locally
      const currentCount = this.favoritesCounts.get(sitId) || 0;
      this.favoritesCounts.set(sitId, currentCount + (this.userFavorites.has(sitId) ? 1 : -1));

      // Update marker appearance
      const marker = this.markers.get(sitId);
      if (marker) {
        const el = marker.getElement();
        el.className = 'satlas-marker';
        if (this.userFavorites.has(sitId)) {
          el.classList.add('favorite');
        }
      }

      // Update marker popup to reflect new count
      const popup = marker.getPopup();
      const sit = { ...marker.sit, id: sitId } as Sit;
      popup.setHTML(this.createMarkerPopup(sit));

    } catch (error) {
      console.error('Error toggling favorite:', error);
      this.showNotification('Error updating favorite', 'error');
    }
  }

  private createMarkerPopup(sit: Sit) {
    const isFavorite = this.userFavorites.has(sit.id);
    const favoriteCount = this.favoritesCounts.get(sit.id) || 0;
    return `
      <div class="satlas-popup">
        <img src="${sit.photoURL}" alt="Sit view" />
        <div class="satlas-popup-info">
          <p class="author">Posted by: ${sit.userName}</p>
          ${favoriteCount > 0 ? `<p>Favorited ${favoriteCount} ${favoriteCount === 1 ? 'time' : 'times'}</p>` : ''}
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

  private setupPopupEventListeners(popup: mapboxgl.Popup, sitId: string) {
    popup.on('open', () => {
      const favoriteButton = document.querySelector(`.favorite-button[data-sit-id="${sitId}"]`);
      if (favoriteButton) {
        // Remove any existing event listeners
        favoriteButton.replaceWith(favoriteButton.cloneNode(true));
        const newButton = document.querySelector(`.favorite-button[data-sit-id="${sitId}"]`);
        newButton?.addEventListener('click', async () => {
          await this.toggleFavorite(sitId);
          // Update button state after toggling
          if (newButton) {
            const isFavorite = this.userFavorites.has(sitId);
            // Update button state
            newButton.className = `favorite-button${isFavorite ? ' active' : ''}`;
            // Update button content
            newButton.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              ${isFavorite ? 'Favorited' : 'Favorite'}
            `;
          }
        });
      }
    });
  }

  // Add new method to refresh markers
  private refreshMarkers() {
    for (const [sitId, marker] of this.markers.entries()) {
      const el = marker.getElement();
      el.className = `satlas-marker${this.userFavorites.has(sitId) ? ' favorite' : ''}`;

      // Also update the popup content if it exists
      const popup = marker.getPopup();
      const sit = { ...marker.sit, id: sitId } as Sit; // We'll need to store sit data
      popup.setHTML(this.createMarkerPopup(sit));
    }
  }

  // Add method to load favorites counts
  private async loadFavoritesCounts(sitIds: string[]) {
    try {
      const favoritesRef = collection(db, 'favorites');
      const q = query(favoritesRef, where('sitId', 'in', sitIds));
      const querySnapshot = await getDocs(q);

      // Reset counts for these sits
      sitIds.forEach(id => this.favoritesCounts.set(id, 0));

      // Count favorites
      querySnapshot.forEach((doc) => {
        const sitId = doc.data().sitId;
        this.favoritesCounts.set(sitId, (this.favoritesCounts.get(sitId) || 0) + 1);
      });
    } catch (error) {
      console.error('Error loading favorites counts:', error);
    }
  }
}

// Initialize the map when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing MapManager');
  new MapManager();
});