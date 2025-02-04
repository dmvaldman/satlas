import { Geolocation } from '@capacitor/geolocation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import mapboxgl from 'mapbox-gl';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

// Replace with your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZG12YWxkbWFuIiwiYSI6ImNpbXRmNXpjaTAxem92OWtrcHkxcTduaHEifQ.6sfBuE2sOf5bVUU6cQJLVQ';

interface Satlas {
  id: string;
  location: {
    latitude: number;
    longitude: number;
  };
  photoURL: string;
  upvotes: number;
  userId: string;
  userName: string;
  createdAt: Date;
}

class MapManager {
  private map: mapboxgl.Map | null = null;
  private markers: mapboxgl.Marker[] = [];

  constructor() {
    console.log('MapManager initialized');
    this.initializeMap();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    const addButton = document.getElementById('add-satlas-btn');
    const modal = document.getElementById('photo-modal');
    const takePhotoBtn = document.getElementById('take-photo');
    const choosePhotoBtn = document.getElementById('choose-photo');
    const cancelBtn = document.getElementById('cancel-photo');

    if (addButton && modal) {
      addButton.addEventListener('click', () => {
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

    // Clear existing markers
    this.markers.forEach(marker => marker.remove());
    this.markers = [];

    // Get the visible bounds of the map
    const bounds = this.map.getBounds();

    try {
      // Query Firebase for satlases within the visible bounds
      const satlasesRef = collection(db, 'satlases');
      const q = query(
        satlasesRef,
        where('location.latitude', '>=', bounds.getSouth()),
        where('location.latitude', '<=', bounds.getNorth())
      );

      const querySnapshot = await getDocs(q);
      console.log('Found satlases:', querySnapshot.size);

      querySnapshot.forEach((doc) => {
        const satlas = doc.data() as Satlas;

        // Create marker element
        const el = document.createElement('div');
        el.className = 'satlas-marker';

        // Create and add the marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([satlas.location.longitude, satlas.location.latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 })
              .setHTML(`
                <div class="satlas-popup">
                  <img src="${satlas.photoURL}" alt="Satlas view" />
                  <p>Upvotes: ${satlas.upvotes}</p>
                </div>
              `)
          )
          .addTo(this.map);

        this.markers.push(marker);
      });
    } catch (error) {
      console.error('Error loading satlases:', error);
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
    try {
      // Get current location
      const coordinates = await this.getCurrentLocation();

      // Here we'll implement uploading to Firebase Storage
      // and creating a new Satlas document
      console.log('Photo captured with coordinates:', coordinates);

      // TODO: Implement Firebase upload and database entry
      // We'll do this in the next step
    } catch (error) {
      console.error('Error handling photo capture:', error);
    }
  }
}

// Initialize the map when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing MapManager');
  new MapManager();
});