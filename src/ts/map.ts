import { Geolocation } from '@capacitor/geolocation';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
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
import { Sit, Coordinates, getDistanceInFeet, UserPreferences } from './types';
import { Capacitor } from '@capacitor/core';
import { MarksManager } from './marks';

// Replace with your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZG12YWxkbWFuIiwiYSI6ImNpbXRmNXpjaTAxem92OWtrcHkxcTduaHEifQ.6sfBuE2sOf5bVUU6cQJLVQ';

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
  private marksManager!: MarksManager;
  private nearbySitsCache: Map<string, Sit> = new Map();  // Add cache for sits
  private lastKnownLocation: Coordinates | null = null;  // Add this to class properties
  private lastVisit: number = 0;  // Add this property

  constructor() {
    console.log('MapManager initialized');
    this.initializeMap();
    this.loadLastVisit();
  }

  private setupEventListeners() {
    const addButton = document.getElementById('add-satlas-btn');
    const modal = document.getElementById('photo-modal');
    const takePhotoBtn = document.getElementById('take-photo');
    const choosePhotoBtn = document.getElementById('choose-photo');
    const cancelBtn = document.getElementById('cancel-photo');

    if (addButton && modal) {
      addButton.addEventListener('click', async () => {
        if (!authManager.isAuthenticated()) {
          this.showNotification('Please sign in to add a sit', 'error');
          return;
        }

        // Check if user has already uploaded a photo nearby
        const coordinates = await this.getCurrentLocation();
        const nearbySit = await this.sitManager.findNearbySit(coordinates);

        if (nearbySit) {
          const images = await this.sitManager.getImagesForSit(nearbySit.imageCollectionId);
          const hasUserUploaded = images.some(
            img => img.userId === authManager.getCurrentUser()?.uid
          );

          if (hasUserUploaded) {
            this.showNotification('You have already uploaded a photo to a nearby Sit. You can change your photo but not add another.', 'error');
            return;
          }
        }

        // If no nearby upload found, show the photo modal
        modal.classList.add('active');
      });
    }

    if (takePhotoBtn) {
      takePhotoBtn.addEventListener('click', () => {
        const modal = document.getElementById('photo-modal');
        const replaceSitId = modal?.dataset.replaceSitId;
        const replaceImageId = modal?.dataset.replaceImageId;

        if (replaceSitId && replaceImageId) {
          this.replacePhoto(replaceSitId, replaceImageId, CameraSource.Camera);
        } else {
          this.capturePhoto();
        }
        modal?.classList.remove('active');
      });
    }

    if (choosePhotoBtn) {
      choosePhotoBtn.addEventListener('click', () => {
        const modal = document.getElementById('photo-modal');
        const replaceSitId = modal?.dataset.replaceSitId;
        const replaceImageId = modal?.dataset.replaceImageId;

        if (replaceSitId && replaceImageId) {
          this.replacePhoto(replaceSitId, replaceImageId, CameraSource.Photos);
        } else {
          this.selectPhoto();
        }
        modal?.classList.remove('active');
      });
    }

    if (cancelBtn && modal) {
      cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }

    // Add carousel navigation
    document.getElementById('map-container')?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Handle carousel navigation
      if (target.matches('.carousel-prev, .carousel-next')) {
        e.preventDefault();
        const carousel = target.closest('.image-carousel');
        if (!carousel) return;

        const slides = carousel.querySelectorAll('.carousel-slide');
        const currentSlide = carousel.querySelector('.carousel-slide.active');
        if (!currentSlide) return;

        let nextIndex = Array.from(slides).indexOf(currentSlide);
        if (target.matches('.carousel-next')) {
          nextIndex = (nextIndex + 1) % slides.length;
        } else {
          nextIndex = (nextIndex - 1 + slides.length) % slides.length;
        }

        slides.forEach(slide => slide.classList.remove('active'));
        slides[nextIndex].classList.add('active');
      }

      // Handle upload button
      if (target.matches('.upload-button')) {
        const sitId = target.dataset.sitId;
        if (sitId) {
          this.handleUploadToExistingSit(sitId);
        }
      }
    });

    // Add event listener for replace photo button
    document.getElementById('map-container')?.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const replaceButton = target.closest('.replace-photo') as HTMLElement;
      if (!replaceButton) return;

      const sitId = replaceButton.dataset.sitId;
      const imageId = replaceButton.dataset.imageId;
      if (!sitId || !imageId) return;

      // Show the photo modal for replacement
      const modal = document.getElementById('photo-modal');
      if (modal) {
        // Store the sit and image IDs for the replacement
        modal.dataset.replaceSitId = sitId;
        modal.dataset.replaceImageId = imageId;
        modal.classList.add('active');
      }
    });

    // Add event listener for delete photo button
    document.getElementById('map-container')?.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const deleteButton = target.closest('.delete-photo') as HTMLElement;
      if (!deleteButton) return;

      const sitId = deleteButton.dataset.sitId;
      const imageId = deleteButton.dataset.imageId;
      if (!sitId || !imageId) return;

      if (confirm('Are you sure you want to delete this photo?')) {
        try {
          await this.sitManager.deleteImage(sitId, imageId);

          // Get updated sit data (or null if the sit was deleted)
          const sit = await this.sitManager.getSit(sitId);

          if (sit) {
            // If sit still exists (had multiple images), update the UI
            const marker = this.markerManager.get(sitId);
            if (marker) {
              const coordinates = await this.getCurrentLocation();
              const isFavorite = this.favoritesManager.isFavorite(sitId);
              const favoriteCount = this.favoritesManager.getFavoriteCount(sitId);

              // Update the marker's sit data
              (marker as any).sit = sit;

              // Update both the marker's popup and any open popup
              const popupContent = this.popupManager.createPopupContent(
                sit,
                isFavorite,
                favoriteCount,
                coordinates
              );
              marker.getPopup()?.setHTML(popupContent);

              // If there's an open popup for this sit, update it too
              const openPopup = document.querySelector('.mapboxgl-popup');
              if (openPopup && openPopup.querySelector(`[data-sit-id="${sitId}"]`)) {
                marker.getPopup()?.addTo(this.map!);
              }
            }
          } else {
            // If sit was deleted (last image was removed), remove the marker and from cache
            const marker = this.markerManager.get(sitId);
            if (marker) {
              marker.remove();
              this.markerManager.delete(sitId);
              this.nearbySitsCache.delete(sitId);  // Remove from cache
            }
          }

          this.showNotification('Photo deleted successfully');
        } catch (error) {
          console.error('Error deleting photo:', error);
          this.showNotification('Error deleting photo', 'error');
        }
      }
    });

    // Add click handler on map to close popups
    this.map.on('click', (e) => {
      // Get the clicked element
      const clickedElement = e.originalEvent.target as HTMLElement;

      // Check if click was on a marker, popup, or their children
      const isMarkerClick = clickedElement.closest('.mapboxgl-marker');
      const isPopupClick = clickedElement.closest('.mapboxgl-popup');

      // Only close if click wasn't on a marker or popup
      if (!isMarkerClick && !isPopupClick) {
        // Close any open popups
        const popups = document.querySelectorAll('.mapboxgl-popup');
        popups.forEach(popup => popup.remove());
      }
    });

    // Add click handler for photo modal backdrop
    const photoModal = document.getElementById('photo-modal');
    if (photoModal) {
      photoModal.addEventListener('click', (e) => {
        // Only close if clicking the backdrop (not the modal content)
        if (e.target === photoModal) {
          photoModal.classList.remove('active');
        }
      });
    }
  }

  private async initializeMap() {
    try {
      const coordinates = await this.getCurrentLocation();
      console.log('Initializing map at coordinates:', coordinates);

      this.map = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 13
      });

      // Initialize managers after map is ready
      await new Promise<void>((resolve) => {
        this.map.on('load', () => {
          this.markerManager = new MarkerManager(this.map);
          this.popupManager = new PopupManager();
          this.favoritesManager = new FavoritesManager();
          this.sitManager = new SitManager();
          this.marksManager = new MarksManager();

          this.setupEventListeners();
          this.setupAuthListener();
          this.setupFavoriteClickListener();
          this.setupMarkClickListener();

          // Add movement listener
          this.map.on('moveend', () => {
            this.loadNearbySits();
          });

          // Load initial sits
          this.loadNearbySits();

          resolve();
        });
      });
    } catch (error) {
      console.error('Error initializing map:', error);
      // Use default NYC coordinates
      this.map = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-74.006, 40.7128],
        zoom: 13
      });
    }
  }

  private async getCurrentLocation(): Promise<Coordinates> {
    try {
      // Try high accuracy first with longer timeout
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      });

      this.lastKnownLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      return this.lastKnownLocation;

    } catch (error) {
      console.log('High accuracy location failed, trying with lower accuracy...', error);

      try {
        // Try lower accuracy with longer timeout
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000
        });

        this.lastKnownLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        return this.lastKnownLocation;

      } catch (error) {
        console.error('Error getting location:', error);

        // Try to use last known location first
        if (this.lastKnownLocation) {
          return this.lastKnownLocation;
        }

        // Then try to use map center if available
        if (this.map) {
          const center = this.map.getCenter();
          return {
            latitude: center.lat,
            longitude: center.lng
          };
        }

        // If all else fails, throw an error
        this.showNotification('Location services are required. Please enable location services and refresh the page.', 'error');
        throw new Error('Could not get location. Location services may be disabled.');
      }
    }
  }

  private async loadLastVisit() {
    if (!this.auth.currentUser) return;

    const userDoc = await getDoc(doc(db, 'userPreferences', this.auth.currentUser.uid));
    if (userDoc.exists()) {
      const prefs = userDoc.data() as UserPreferences;
      this.lastVisit = prefs.lastVisit || 0;
    }

    // Update lastVisit to now
    const now = Date.now();
    await setDoc(doc(db, 'userPreferences', this.auth.currentUser.uid),
      { lastVisit: now },
      { merge: true }
    );
  }

  private isNewSit(sit: Sit): boolean {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const cutoffTime = Math.min(this.lastVisit, oneWeekAgo);

    if (sit.createdAt instanceof Date) {
      return sit.createdAt.getTime() > cutoffTime;
    } else {
      return (sit.createdAt as any).toMillis() > cutoffTime;
    }
  }

  private async loadNearbySits() {
    if (!this.map) return;
    const bounds = this.map.getBounds();
    if (!bounds) return;

    const sits = await this.sitManager.loadNearbySits({
      north: bounds.getNorth(),
      south: bounds.getSouth()
    });

    console.log('Loaded sits with locations:', sits.map(sit => ({
      id: sit.id,
      location: sit.location,
      images: sit.imageCollectionId
    })));

    this.updateNearbySitsCache(sits);  // Update cache with new sits

    const newSitIds = sits
      .filter(sit => !this.markerManager.has(sit.id))
      .map(sit => sit.id);

    if (newSitIds.length > 0) {
      await this.favoritesManager.loadFavoritesCounts(newSitIds);
    }

    // Get current location once for all markers
    const currentLocation = await this.getCurrentLocation();

    sits.forEach(sit => {
      if (!this.markerManager.has(sit.id)) {
        const isOwnSit = sit.uploadedBy === this.auth.currentUser?.uid;
        const isFavorite = this.favoritesManager.isFavorite(sit.id);
        const favoriteCount = this.favoritesManager.getFavoriteCount(sit.id);
        const isNew = !isOwnSit && this.isNewSit(sit);
        const marks = this.marksManager.getMarks(sit.id);
        const markCounts = {
          favorite: this.marksManager.getMarkCount(sit.id, 'favorite'),
          wantToGo: this.marksManager.getMarkCount(sit.id, 'wantToGo'),
          visited: this.marksManager.getMarkCount(sit.id, 'visited')
        };

        const marker = this.markerManager.createMarker(sit, isOwnSit, marks.has('favorite'), isNew);
        const popup = this.popupManager.createSitPopup(sit, marks, markCounts, currentLocation);

        marker.setPopup(popup);
        this.markerManager.set(sit.id, marker);
      }
    });
  }

  private cleanupWebCameraUI() {
    // Find and cleanup any PWA camera elements
    const cameraModal = document.querySelector('pwa-camera-modal');
    const cameraModalContent = document.querySelector('pwa-camera-modal-instance');
    const videoElement = document.querySelector('pwa-camera-modal video');

    // Stop any active video streams
    if (videoElement instanceof HTMLVideoElement) {
      const stream = videoElement.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      videoElement.srcObject = null;
    }

    // Remove the elements if they exist
    if (cameraModalContent?.parentNode) {
      cameraModalContent.parentNode.removeChild(cameraModalContent);
    }
    if (cameraModal?.parentNode) {
      cameraModal.parentNode.removeChild(cameraModal);
    }
  }

  private async capturePhoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: false,
        correctOrientation: true
      });

      if (image.base64String) {
        console.log('Photo captured, starting upload...');
        // Create a temporary marker first
        const coordinates = await this.getCurrentLocation();
        const tempMarkerId = `temp_${Date.now()}`;
        const tempMarker = this.markerManager.createMarker(
          { location: coordinates } as Sit,  // Create minimal sit object for temp marker
          true,
          true
        );
        tempMarker.addTo(this.map!);
        this.markerManager.set(tempMarker.id, tempMarker);

        // Handle the upload with the temporary marker
        await this.handlePhotoUpload(image.base64String);
      }
    } catch (error) {
      // Only show error if it's not a user cancellation
      if (!(error instanceof Error) || !error.message.includes('User cancelled')) {
        console.error('Error capturing photo:', error);
        this.showNotification('Error capturing photo', 'error');
      }
    }
  }

  private async selectPhoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos,
        saveToGallery: false,
        correctOrientation: true
      });

      if (image.base64String) {
        console.log('Photo selected, starting upload...');
        await this.handlePhotoUpload(image.base64String);
      }
    } catch (error) {
      // Only show error if it's not a user cancellation
      if (!(error instanceof Error) || !error.message.includes('User cancelled')) {
        console.error('Error selecting photo:', error);
        this.showNotification('Error selecting photo', 'error');
      }
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

      // Check for nearby sits first
      const nearbySit = await this.sitManager.findNearbySit(coordinates);
      if (nearbySit) {
        // Get images for this sit
        const images = await this.sitManager.getImagesForSit(nearbySit.imageCollectionId);

        // Check if the user has already uploaded a photo to this sit
        const hasUserUploaded = images.some(
          img => img.userId === authManager.getCurrentUser()?.uid
        );

        if (hasUserUploaded) {
          this.showNotification('You have already uploaded a photo to this Sit. You can change your photo but not add another.', 'error');
          return;
        }

        // If there's a nearby sit and user hasn't uploaded, add the photo
        await this.handlePhotoUpload(base64Image, nearbySit.id);
        return;
      }

      // Create temporary marker for new sit
      if (this.map) {
        const el = document.createElement('div');
        el.className = 'satlas-marker pending';

        tempMarker = new mapboxgl.Marker(el)
          .setLngLat([coordinates.longitude, coordinates.latitude])
          .setPopup(this.popupManager.createLoadingPopup())
          .addTo(this.map);

        tempMarkerId = `temp_${Date.now()}`;
        this.markerManager.set(tempMarkerId, tempMarker);
      }

      // Strip EXIF data from image
      const strippedImage = await stripExif(base64Image);

      // Upload image
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);
      const base64WithoutPrefix = strippedImage.replace(/^data:image\/\w+;base64,/, '');
      await uploadString(storageRef, base64WithoutPrefix, 'base64');
      const photoURL = await getDownloadURL(storageRef);

      const currentUser = authManager.getCurrentUser();
      const sitData = {
        location: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude
        },
        imageCollectionId: `${Date.now()}_${currentUser?.uid}`, // Generate a new collection ID
        uploadedBy: currentUser?.uid || 'anonymous',
        createdAt: serverTimestamp()
      };

      // Add to Firestore
      const docRef = await addDoc(collection(db, 'sits'), sitData);
      const sitId = docRef.id;

      // Update the temporary marker to be permanent
      if (tempMarker && tempMarkerId) {
        const el = tempMarker.getElement();
        el.classList.remove('pending');
        el.className = 'satlas-marker own-sit';

        const sit = { id: sitId, ...sitData };
        (tempMarker as any).sit = sit;

        tempMarker.setPopup(
          this.popupManager.createSitPopup(
            sit,
            new Set<MarkType>(),  // No marks for new sit
            {
              favorite: 0,
              visited: 0
            },
            coordinates
          )
        );

        // Update marker tracking with permanent ID
        this.markerManager.delete(tempMarkerId);
        this.markerManager.set(sitId, tempMarker);
      }

    } catch (error) {
      console.error('Error handling photo capture:', error);

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
    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Load user data
        await Promise.all([
          this.marksManager.loadUserMarks(user.uid),
          this.loadLastVisit()
        ]);

        // Refresh all markers with new mark state
        const currentLocation = await this.getCurrentLocation();
        this.markerManager.getAll().forEach(([sitId, marker]) => {
          const sit = (marker as any).sit as Sit;
          if (!sit) return;

          const marks = this.marksManager.getMarks(sitId);
          const markCounts = {
            favorite: this.marksManager.getMarkCount(sitId, 'favorite'),
            wantToGo: this.marksManager.getMarkCount(sitId, 'wantToGo'),
            visited: this.marksManager.getMarkCount(sitId, 'visited')
          };

          // Update marker style
          this.markerManager.updateMarkerStyle(marker, sit.uploadedBy === user.uid, marks.has('favorite'));

          // Update popup
          marker.setPopup(this.popupManager.createSitPopup(
            sit,
            marks,
            markCounts,
            currentLocation
          ));
        });
      } else {
        // Clear marks on sign out
        this.marksManager.clear();

        // Reset markers to unsigned-in state
        const currentLocation = await this.getCurrentLocation();
        this.markerManager.getAll().forEach(([sitId, marker]) => {
          const sit = (marker as any).sit as Sit;
          if (!sit) return;

          // Update marker style
          this.markerManager.updateMarkerStyle(marker, false, false);

          // Update popup with empty marks
          marker.setPopup(this.popupManager.createSitPopup(
            sit,
            new Set<MarkType>(),  // No marks for new sit
            {
              favorite: 0,
              visited: 0
            },
            currentLocation
          ));
        });
      }
    });
  }

  private setupFavoriteClickListener() {
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
        const coordinates = await this.getCurrentLocation();
        const sit = (marker as any).sit;
        const isFavorite = this.favoritesManager.isFavorite(sitId);
        const favoriteCount = this.favoritesManager.getFavoriteCount(sitId);
        marker.getPopup()?.setHTML(this.popupManager.createPopupContent(
          sit,
          isFavorite,
          favoriteCount,
          coordinates
        ));
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
    const userId = this.auth.currentUser.uid;

    // Optimistically update UI
    const wasAlreadyFavorite = this.favoritesManager.isFavorite(sitId);
    const oldFavoriteCount = this.favoritesManager.getFavoriteCount(sitId);

    // Update local state immediately
    this.favoritesManager.updateLocalFavorite(sitId, userId, !wasAlreadyFavorite);

    // Update UI immediately
    const coordinates = await this.getCurrentLocation();
    const isFavorite = this.favoritesManager.isFavorite(sitId);
    const favoriteCount = this.favoritesManager.getFavoriteCount(sitId);

    // Update marker and popup
    this.markerManager.updateMarkerStyle(marker, sit.uploadedBy === userId, isFavorite);
    marker.getPopup()?.setHTML(this.popupManager.createPopupContent(
      sit,
      isFavorite,
      favoriteCount,
      coordinates
    ));

    try {
      // Try to update server
      await this.favoritesManager.toggleFavorite(sitId, userId);
    } catch (error) {
      console.error('Error updating favorite:', error);

      // Revert local state on error
      this.favoritesManager.updateLocalFavorite(sitId, userId, wasAlreadyFavorite);

      // Revert UI
      this.markerManager.updateMarkerStyle(marker, sit.uploadedBy === userId, wasAlreadyFavorite);
      marker.getPopup()?.setHTML(this.popupManager.createPopupContent(
        sit,
        wasAlreadyFavorite,
        oldFavoriteCount,
        coordinates
      ));

      this.showNotification('Error updating favorite', 'error');
    }
  }

  private async handleUploadToExistingSit(sitId: string) {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: false,
        correctOrientation: true
      });

      if (image.base64String) {
        await this.handlePhotoUpload(image.base64String, sitId);
      }
    } catch (error) {
      // Only show error if it's not a user cancellation
      if (!(error instanceof Error) || !error.message.includes('User cancelled')) {
        console.error('Error capturing photo:', error);
        this.showNotification('Error uploading photo', 'error');
      }
    }
  }

  private async handlePhotoUpload(base64Image: string, existingSitId?: string) {
    if (!this.auth.currentUser) {
      this.showNotification('Please sign in to add photos', 'error');
      return;
    }

    try {
      const exifLocation = await getImageLocation(base64Image);
      const coordinates = exifLocation || await this.getCurrentLocation();

      if (existingSitId) {
        // Add photo to existing sit
        const existingSit = this.nearbySitsCache.get(existingSitId);
        if (existingSit) {
          await this.addPhotoToExistingSit(base64Image, existingSit);
        }
        return;
      }

      // Check if a sit already exists at this location
      const nearbySit = Array.from(this.nearbySitsCache.values())
        .find(sit => getDistanceInFeet(coordinates, sit.location) < 100);

      if (nearbySit) {
        const images = await this.sitManager.getImagesForSit(nearbySit.imageCollectionId);
        const hasUserUploaded = images.some(
          img => img.userId === this.auth.currentUser!.uid
        );

        if (hasUserUploaded) {
          this.showNotification('You have already uploaded a photo to this Sit', 'error');
          return;
        }
        // Add photo to existing sit
        await this.addPhotoToExistingSit(base64Image, nearbySit);
        return;
      }

      // Create new sit...
      const el = document.createElement('div');
      el.className = this.markerManager.getMarkerClasses(true, false);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([coordinates.longitude, coordinates.latitude])
        .addTo(this.map!);

      try {
        const sit = await this.sitManager.uploadSit(
          base64Image,
          coordinates,
          this.auth.currentUser.uid,
          this.auth.currentUser.displayName || 'Anonymous'
        );

        (marker as any).sit = sit;

        marker.setPopup(this.popupManager.createSitPopup(
          sit,
          new Set<MarkType>(),
          {
            favorite: 0,
            visited: 0,
            wantToGo: 0
          },
          coordinates
        ));

        this.markerManager.set(sit.id, marker);
        this.nearbySitsCache.set(sit.id, sit);

        this.showNotification('Photo uploaded successfully');
      } catch (error) {
        marker.remove();
        throw error;
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      this.showNotification('Error uploading photo', 'error');
    }
  }

  private async addPhotoToExistingSit(base64Image: string, existingSit: Sit) {
    try {
      // Upload photo and add to existing sit
      const imageData = {
        photoURL: await this.uploadPhotoToStorage(base64Image),
        userId: this.auth.currentUser!.uid,
        userName: this.auth.currentUser!.displayName || 'Anonymous'
      };

      await this.sitManager.addImageToSit(existingSit.id, imageData);

      // Update marker with new sit data
      const updatedSit = await this.sitManager.getSit(existingSit.id);
      if (updatedSit) {
        const marker = this.markerManager.get(existingSit.id);
        if (marker) {
          (marker as any).sit = updatedSit;
          marker.setPopup(this.popupManager.createSitPopup(
            updatedSit,
            this.marksManager.getMarks(existingSit.id),
            {
              favorite: this.marksManager.getMarkCount(existingSit.id, 'favorite'),
              visited: this.marksManager.getMarkCount(existingSit.id, 'visited')
            },
            updatedSit.location
          ));
        }
        this.nearbySitsCache.set(existingSit.id, updatedSit);
      }

      this.showNotification('Photo added successfully');
    } catch (error) {
      console.error('Error adding photo to existing sit:', error);
      this.showNotification('Error adding photo', 'error');
    }
  }

  private async uploadPhotoToStorage(base64Image: string): Promise<string> {
    const strippedImage = await stripExif(base64Image);
    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);
    const base64WithoutPrefix = strippedImage.replace(/^data:image\/\w+;base64,/, '');
    await uploadString(storageRef, base64WithoutPrefix, 'base64');
    return getDownloadURL(storageRef);
  }

  private async replacePhoto(sitId: string, imageId: string, source: CameraSource) {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source,
        saveToGallery: false,
        correctOrientation: true
      });

      if (image?.base64String) {
        await this.handlePhotoReplacement(sitId, imageId, image.base64String);
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('User cancelled')) {
        console.error('Error replacing photo:', error);
        this.showNotification('Error replacing photo', 'error');
      }
    }
  }

  private async handlePhotoReplacement(sitId: string, imageId: string, base64Image: string) {
    try {
      // Get the current location and the sit's location
      const currentLocation = await this.getCurrentLocation();
      const sit = await this.sitManager.getSit(sitId);

      if (!sit) {
        this.showNotification('Could not find the Sit to update', 'error');
        return;
      }

      // Check if the current location is close enough to the sit
      const distance = getDistanceInFeet(currentLocation, sit.location);
      const MAX_DISTANCE = 300; // 300 feet maximum distance

      if (distance > MAX_DISTANCE) {
        this.showNotification(
          `You must be within ${MAX_DISTANCE} feet of the Sit to replace its photo. Current distance: ${Math.round(distance)} feet.`,
          'error'
        );
        return;
      }

      // If location is valid, proceed with the replacement
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);
      const base64WithoutPrefix = base64Image.replace(/^data:image\/\w+;base64,/, '');
      await uploadString(storageRef, base64WithoutPrefix, 'base64');
      const photoURL = await getDownloadURL(storageRef);

      // Update the image in Firestore
      await this.sitManager.replaceImage(sitId, imageId, photoURL);

      // Update the UI immediately
      const marker = this.markerManager.get(sitId);
      if (marker) {
        const updatedSit = await this.sitManager.getSit(sitId);
        if (updatedSit) {
          const isFavorite = this.favoritesManager.isFavorite(sitId);
          const favoriteCount = this.favoritesManager.getFavoriteCount(sitId);

          // Update the marker's sit data
          (marker as any).sit = updatedSit;

          // Update both the marker's popup and any open popup
          const popupContent = this.popupManager.createPopupContent(
            updatedSit,
            isFavorite,
            favoriteCount,
            currentLocation
          );
          marker.getPopup()?.setHTML(popupContent);

          // If there's an open popup for this sit, update it too
          const openPopup = document.querySelector('.mapboxgl-popup');
          if (openPopup && openPopup.querySelector(`[data-sit-id="${sitId}"]`)) {
            marker.getPopup()?.addTo(this.map!);
          }
        }
      }
    } catch (error) {
      console.error('Error replacing photo:', error);
      this.showNotification('Error replacing photo', 'error');
    }
  }

  private updateNearbySitsCache(sits: Sit[]) {
    sits.forEach(sit => {
      this.nearbySitsCache.set(sit.id, sit);
    });
  }

  private setupMarkClickListener() {
    document.getElementById('map-container')?.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const markButton = target.closest('.mark-button') as HTMLElement;
      if (!markButton) return;

      e.stopPropagation();

      const sitId = markButton.dataset.sitId;
      const markType = markButton.dataset.markType as MarkType;
      if (!sitId || !markType) return;

      const userId = this.auth.currentUser?.uid;
      if (!userId) {
        this.showNotification('Please sign in to mark sits', 'error');
        return;
      }

      const sit = this.nearbySitsCache.get(sitId);
      if (!sit) return;

      const marker = this.markerManager.get(sitId);
      if (!marker) return;

      // Optimistically update UI
      const isMarked = markButton.classList.contains('active');
      markButton.classList.toggle('active');

      // Update count display
      const countSpan = markButton.querySelector('.mark-count');
      const currentCount = parseInt(countSpan?.textContent || '0');
      const newCount = isMarked ? currentCount - 1 : currentCount + 1;
      if (countSpan) {
        countSpan.textContent = newCount.toString();
      }

      // Update favorite count text if this is a favorite mark
      if (markType === 'favorite') {
        const favoriteText = marker.getPopup()?.getElement()?.querySelector('.favorite-count-text');
        if (favoriteText) {
          if (newCount > 0) {
            favoriteText.textContent = `Favorited ${newCount} ${newCount === 1 ? 'time' : 'times'}`;
          } else {
            favoriteText.textContent = '';
          }
        }

        // Update marker style
        this.markerManager.updateMarkerStyle(
          marker,
          sit.uploadedBy === userId,
          !isMarked
        );
      }

      try {
        await this.marksManager.toggleMark(sitId, userId, markType);
      } catch (error) {
        // Revert all UI changes on error
        markButton.classList.toggle('active');
        if (countSpan) {
          countSpan.textContent = currentCount.toString();
        }

        if (markType === 'favorite') {
          const favoriteText = marker.getPopup()?.getElement()?.querySelector('.favorite-count-text');
          if (favoriteText) {
            if (currentCount > 0) {
              favoriteText.textContent = `Favorited ${currentCount} ${currentCount === 1 ? 'time' : 'times'}`;
            } else {
              favoriteText.textContent = '';
            }
          }

          this.markerManager.updateMarkerStyle(
            marker,
            sit.uploadedBy === userId,
            isMarked
          );
        }

        console.error('Error updating mark:', error);
        this.showNotification('Error updating mark', 'error');
      }
    });
  }

  private async loadSits() {
    try {
      const sits = await this.sitManager.loadNearbySits(this.map.getCenter());
      this.updateNearbySitsCache(sits);

      const currentUser = this.auth.currentUser;
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days in milliseconds

      sits.forEach(sit => {
        if (!this.markerManager.has(sit.id)) {
          const isOwnSit = sit.uploadedBy === currentUser?.uid;
          const marks = this.marksManager.getMarks(sit.id);
          const isFavorite = marks.has('favorite');

          const sitCreatedAt = sit.createdAt instanceof Date ?
            sit.createdAt.getTime() :
            (sit.createdAt as any).toMillis();

          // Only show new if it's not the user's own sit
          const isNew = !isOwnSit && (sitCreatedAt > this.lastVisit || sitCreatedAt > oneWeekAgo);

          const marker = this.markerManager.createMarker(
            sit,
            isOwnSit,
            isFavorite,
            isNew
          );

          // Add popup
          marker.setPopup(this.popupManager.createSitPopup(
            sit,
            marks,
            {
              favorite: this.marksManager.getMarkCount(sit.id, 'favorite'),
              visited: this.marksManager.getMarkCount(sit.id, 'visited'),
              wantToGo: this.marksManager.getMarkCount(sit.id, 'wantToGo')
            },
            this.map.getCenter()
          ));

          (marker as any).sit = sit;
          this.markerManager.set(sit.id, marker);
        }
      });
    } catch (error) {
      console.error('Error loading sits:', error);
    }
  }
}