import React from 'react';
import mapboxgl from 'mapbox-gl';
import { User } from 'firebase/auth';
import AuthComponent from './components/AuthComponent';
import MapComponent from './components/MapComponent';
import { Image, Sit, Coordinates, MarkType, PhotoResult } from './types';
import PhotoUploadComponent from './components/PhotoUpload';
import ProfileModal from './components/ProfileModal';
import { UserPreferences } from './types';
import AddSitButton from './components/AddSitButton';
import NearbyExistingSitModal from './components/NearbyExistingSitModal';
import { FirebaseService } from './services/FirebaseService';
import { LocationService } from './utils/LocationService';
import { auth } from './services/FirebaseService';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import PopupComponent from './components/Popup';
import { OfflineService } from './services/OfflineService';
import { ValidationUtils } from './utils/ValidationUtils';
import Notification from './components/Notification';

interface AppState {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  authIsReady: boolean;

  // Map state
  map: mapboxgl.Map | null;
  currentLocation: { latitude: number; longitude: number } | null;
  isMapLoading: boolean;

  // Data state
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;

  // Modal state
  modals: {
    photo: {
      isOpen: boolean;
      data: Sit | { sitId: string; imageId: string; } | null;
    };
    profile: {
      isOpen: boolean;
    };
    nearbySit: {
      isOpen: boolean;
      data: Sit | null;
    };
  };

  userPreferences: UserPreferences;

  // Add drawer state
  drawer: {
    isOpen: boolean;
    sit: Sit | null;
    images: Image[];
  };

  // Add this new property
  isOffline: boolean;
}

class App extends React.Component<{}, AppState> {
  private mapContainer = React.createRef<HTMLDivElement>();
  private mapComponentRef = React.createRef<MapComponent>();
  private locationService: LocationService;
  private authUnsubscribe: (() => void) | null = null;
  private offlineServiceUnsubscribe: (() => void) | null = null;

  constructor(props: {}) {
    super(props);

    this.state = {
      // Auth state
      user: null,
      isAuthenticated: false,
      authIsReady: false,

      // Map state
      map: null,
      currentLocation: null,
      isMapLoading: true,

      // Data state
      sits: new Map(),
      marks: new Map(),
      favoriteCount: new Map(),

      // Modal state
      modals: {
        photo: { isOpen: false, data: null },
        profile: { isOpen: false },
        nearbySit: { isOpen: false, data: null }
      },

      userPreferences: {
        username: '',
        pushNotificationsEnabled: false,
        lastVisit: 0
      },

      // Initialize drawer state
      drawer: {
        isOpen: false,
        sit: null,
        images: []
      },

      // Initialize offline state
      isOffline: false
    };

    this.locationService = new LocationService();
  }

  componentDidMount() {
    // Configure status bar for mobile devices
    if (Capacitor.isNativePlatform()) {
      this.configureStatusBar();

      // Initialize Firebase app state listeners
      FirebaseService.initializeAppStateListeners();
    }

    // 1. Set up auth listener (which may never fire in Capacitor)
    this.authUnsubscribe = FirebaseService.onAuthStateChange(async (user) => {
      console.log('[App] Auth state changed:', user ? user.displayName : 'null');

      if (user) {
        this.setState({
          user,
          isAuthenticated: true,
          authIsReady: true
        });

        // Load user preferences when auth state changes
        this.loadUserData(user.uid);
      } else {
        this.setState({
          user: null,
          isAuthenticated: false,
          authIsReady: true
        });
      }
    });

    // 2. Check auth state immediately on mount (workaround)
    const currentUser = auth.currentUser;
    console.log('[App] Direct auth check on mount:', currentUser?.displayName || 'not signed in');

    this.setState({
      user: currentUser,
      isAuthenticated: !!currentUser,
      authIsReady: true  // Always make UI available
    });

    // Load user preferences if user is already authenticated
    if (currentUser) {
      this.loadUserData(currentUser.uid);
    }

    // Initialize map after component is mounted
    this.initializeMap();

    // Set up location listener
    this.locationService.addLocationListener(this.handleLocationUpdate);

    // Initialize OfflineService and add listener
    this.initializeOfflineService();
  }

  componentWillUnmount() {
    // Clean up map when component unmounts
    if (this.state.map) {
      this.state.map.remove();
    }

    // Clean up location tracking
    this.locationService.removeLocationListener(this.handleLocationUpdate);
    this.locationService.stopLocationTracking();

    // Clean up auth listener
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
    }

    // Clean up offline service listener
    if (this.offlineServiceUnsubscribe) {
      this.offlineServiceUnsubscribe();
    }
  }

  private initializeMap = () => {
    console.log('Initializing map');

    if (!this.mapContainer.current) {
      console.error('Map container ref is not available');
      return;
    }

    // Get location first, then initialize map
    console.log('Getting location');
    this.locationService.getCurrentLocation()
      .then(coordinates => {
        console.log('Initial coordinates for map:', coordinates);

        if (!this.mapContainer.current) return;

        // Create map centered on user location
        const map = new mapboxgl.Map({
          container: this.mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [coordinates.longitude, coordinates.latitude],
          zoom: 13
        });

        // Set state with map and location
        this.setState({
          map,
          currentLocation: coordinates,
          isMapLoading: false
        });

        // When map is fully loaded
        map.on('load', () => {
          console.log('Map fully loaded');

          // Start tracking location
          this.locationService.startLocationTracking();

          // Load sits based on initial map bounds
          const mapBounds = map.getBounds();
          if (mapBounds) {
            this.handleLoadSits({
              north: mapBounds.getNorth(),
              south: mapBounds.getSouth()
            });
          }

          window.dispatchEvent(new CustomEvent('mapReady'));
        });

        // Add moveend handler
        map.on('moveend', () => {
          const bounds = map.getBounds();
          if (bounds) {
            this.handleLoadSits({
              north: bounds.getNorth(),
              south: bounds.getSouth()
            });
          }
        });
      })
      .catch(error => {
        console.error('Error getting location or initializing map:', error);
        this.initializeMapWithDefaultLocation();
      });
  };

  // Separate method for fallback initialization
  private initializeMapWithDefaultLocation = () => {
    if (!this.mapContainer.current) return;

    const defaultLocation = { latitude: 37.7749, longitude: -122.4194 };

    const map = new mapboxgl.Map({
      container: this.mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [defaultLocation.longitude, defaultLocation.latitude],
      zoom: 13
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    this.setState({
      map,
      currentLocation: defaultLocation,
      isMapLoading: false
    });

    map.on('load', () => {
      const mapBounds = map.getBounds();
      if (mapBounds) {
        this.handleLoadSits({
          north: mapBounds.getNorth(),
          south: mapBounds.getSouth()
        });
      }
    });
  };

  private async loadUserData(userId: string) {
    try {
      const marksMap = await FirebaseService.loadUserMarks(userId);
      const favoriteCounts = await FirebaseService.loadFavoriteCounts();
      const userData = await FirebaseService.loadUserPreferences(userId);

      this.setState({
        marks: marksMap,
        favoriteCount: favoriteCounts,
        userPreferences: userData
      });
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  // Auth methods
  private handleSignIn = async () => {
    console.log('[App] handleSignIn called');
    try {
      await FirebaseService.signInWithGoogle();
      console.log('[App] Sign-in successful');

      // Force update the UI state directly after sign-in
      const currentUser = auth.currentUser;
      if (currentUser) {
        this.setState({
          user: currentUser,
          isAuthenticated: true,
          authIsReady: true
        }, async () => {
          console.log('[App] State manually updated after sign-in');

          // Load user preferences after state is updated
          try {
            const preferences = await this.loadUserData(currentUser.uid);
            console.log('[App] User preferences loaded after sign-in:', preferences);
          } catch (error) {
            console.error('[App] Error loading preferences after sign-in:', error);
          }
        });
      }
    } catch (error) {
      console.error('[App] Sign-in error:', error);
      this.showNotification('Failed to sign in.', 'error');
    }
  };

  private handleSignOut = async () => {
    try {
      await FirebaseService.signOut();

      // Explicitly update the auth state in React
      this.setState({
        user: null,
        isAuthenticated: false,
        marks: new Map(),
        favoriteCount: new Map()
      }, () => console.log('[App] State manually updated after sign-out'));

    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // UI methods
  private toggleProfile = () => {
    // Use functional state update to prevent race conditions
    this.setState(prevState => {
      // If the profile is currently open, just close it
      if (prevState.modals.profile.isOpen) {
        return {
          modals: {
            ...prevState.modals,
            profile: {
              isOpen: false
            }
          }
        };
      }

      // Otherwise, toggle it normally
      return {
        modals: {
          ...prevState.modals,
          profile: {
            isOpen: !prevState.modals.profile.isOpen
          }
        }
      };
    });
  };

  private togglePhotoUpload = (sit?: Sit) => {
    console.log('[App] togglePhotoUpload called with sit:', sit ? sit.id : 'null');

    this.setState(prevState => {
      // If we're opening the photo modal
      if (!prevState.modals.photo.isOpen) {
        console.log('[App] Opening photo modal, drawer state:',
          prevState.drawer.isOpen ? `open with sit ${prevState.drawer.sit?.id}` : 'closed');

        return {
          modals: {
            ...prevState.modals,
            photo: {
              isOpen: true,
              data: sit || null
            }
          }
        };
      }
      // If we're closing the photo modal
      else {
        console.log('[App] Closing photo modal');

        return {
          modals: {
            ...prevState.modals,
            photo: {
              isOpen: false,
              data: null
            }
          }
        };
      }
    });
  };

  private toggleNearbySitModal = (sit?: Sit) => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        nearbySit: {
          isOpen: !prevState.modals.nearbySit.isOpen,
          data: sit || null
        }
      }
    }));
  };

  private handleSavePreferences = async (prefs: UserPreferences) => {
    const { user } = this.state;
    if (!user) return;

    try {
      await FirebaseService.saveUserPreferences(user.uid, prefs);
      this.setState({ userPreferences: prefs });
      this.toggleProfile();
    } catch (error) {
      console.error('Error saving preferences:', error);
      throw error;
    }
  };

  private handleLoadSits = async (bounds: { north: number; south: number }) => {
    try {
      const newSits = await FirebaseService.loadSits(bounds);

      // Only update state if there are actual changes
      let hasChanges = false;
      const currentSits = this.state.sits;

      newSits.forEach((sit, id) => {
        if (!currentSits.has(id) || JSON.stringify(currentSits.get(id)) !== JSON.stringify(sit)) {
          hasChanges = true;
        }
      });

      if (hasChanges) {
        console.log(`Loaded ${newSits.size} sits`);
        this.setState({ sits: newSits });
      }
    } catch (error) {
      console.error('Error loading nearby sits:', error);
    }
  };

  private handleToggleMark = async (sitId: string, type: MarkType) => {
    const { sits, marks, favoriteCount, user } = this.state;
    if (!user) return;

    const sit = sits.get(sitId);
    if (!sit) return;

    // Get current marks for this sit
    const currentMarks = new Set(marks.get(sitId) || new Set<MarkType>());
    const currentFavoriteCount = favoriteCount.get(sitId) || 0;

    // Create new marks set
    const newMarks = new Set<MarkType>(currentMarks);
    let newFavoriteCount = currentFavoriteCount;

    // Toggle the mark
    if (currentMarks.has(type)) {
      newMarks.delete(type);
      if (type === 'favorite') {
        newFavoriteCount = Math.max(0, currentFavoriteCount - 1);
      }
    } else {
      // Clear all marks first
      newMarks.clear();
      // Then add the new mark
      newMarks.add(type);

      // If we're adding a favorite and removing something else, adjust the count
      if (type === 'favorite') {
        newFavoriteCount++;
      } else if (currentMarks.has('favorite')) {
        // If we're switching from favorite to another mark, decrement the favorite count
        newFavoriteCount = Math.max(0, currentFavoriteCount - 1);
      }
    }

    // Update state immediately for optimistic UI update
    const updatedMarks = new Map(marks);
    updatedMarks.set(sitId, newMarks);

    const updatedFavoriteCount = new Map(favoriteCount);
    updatedFavoriteCount.set(sitId, newFavoriteCount);

    this.setState({
      marks: updatedMarks,
      favoriteCount: updatedFavoriteCount
    });

    // Make the actual API call
    try {
      await FirebaseService.toggleMark(user.uid, sitId, type);
      // Server update successful, no need to update state again
    } catch (error) {
      console.error('Error toggling mark:', error);

      // On error, revert to previous state
      const revertedMarks = new Map(this.state.marks);
      revertedMarks.set(sitId, currentMarks);

      const revertedFavoriteCount = new Map(this.state.favoriteCount);
      revertedFavoriteCount.set(sitId, currentFavoriteCount);

      this.setState({
        marks: revertedMarks,
        favoriteCount: revertedFavoriteCount
      });

      this.showNotification('Failed to update. Please try again.', 'error');
    }
  };

  private handleDeleteImage = async (sitId: string, imageId: string) => {
    const { user, sits, drawer, isOffline } = this.state;
    if (!user) throw new Error('Must be logged in to delete images');

    const sit = sits.get(sitId);
    if (!sit) throw new Error('Sit not found');

    try {
      // Check if this is a temporary image (starts with 'temp_')
      const isTemporaryImage = imageId.startsWith('temp_');

      // Optimistically update UI first
      if (drawer.sit && drawer.sit.id === sitId) {
        const updatedImages = drawer.images.filter(img => img.id !== imageId);

        // If this was the last image, close the drawer
        if (updatedImages.length === 0) {
          this.setState({
            drawer: {
              isOpen: false,
              sit: null,
              images: []
            }
          });
        } else {
          // Otherwise just update the images list
          this.setState(prevState => ({
            drawer: {
              ...prevState.drawer,
              images: updatedImages
            }
          }));
        }
      }

      // If it's a temporary image, we don't need to delete it from the server
      if (!isTemporaryImage) {
        // If we're offline, queue the deletion
        if (isOffline) {
          const offlineService = OfflineService.getInstance();
          await offlineService.addPendingImageDeletion(
            imageId,
            user.uid,
            this.state.userPreferences.username
          );
          this.showNotification('Image will be deleted when you\'re back online', 'success');
          return;
        }

        try {
          // Try to delete from server
          await FirebaseService.deleteImage(imageId, user.uid);

          // If this was the last image, remove the sit from local state
          const wasLastImage = drawer.images.length <= 1;
          if (wasLastImage) {
            // Remove the sit from the local state
            this.setState(prevState => {
              const updatedSits = new Map(prevState.sits);
              updatedSits.delete(sitId);
              return { sits: updatedSits };
            });
          }
        } catch (error) {
          console.error('Error deleting image:', error);
          this.showNotification(error instanceof Error ? error.message : 'Failed to delete image', 'error');
          throw error;
        }
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      this.showNotification(error instanceof Error ? error.message : 'Failed to delete image', 'error');
      throw error;
    }
  };

  private handleReplaceImage = (sitId: string, imageId: string) => {
    // Check if this is a temporary image (starts with 'temp_')
    const isTemporaryImage = imageId.startsWith('temp_');

    if (isTemporaryImage) {
      // For temporary images, it's simpler to just delete and add a new one
      // First, remove the temporary image from the UI
      const { drawer } = this.state;
      if (drawer.sit && drawer.sit.id === sitId) {
        const updatedImages = drawer.images.filter(img => img.id !== imageId);
        this.setState(prevState => ({
          drawer: {
            ...prevState.drawer,
            images: updatedImages
          }
        }));
      }

      // Then open the photo upload modal to add a new image
      const sit = this.state.sits.get(sitId);
      this.togglePhotoUpload(sit || undefined);
      return;
    }

    // For regular images, proceed with normal replacement
    const replacementData = {
      sitId,
      imageId
    };

    // Open photo upload modal with replacement data
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        photo: {
          isOpen: true,
          data: replacementData
        }
      }
    }));
  };

  private getImagesForSit = async (imageCollectionId: string): Promise<Image[]> => {
    try {
      // Use FirebaseService to get images
      return await FirebaseService.getImages(imageCollectionId);
    } catch (error) {
      console.error('Error fetching images:', error);
      throw error;
    }
  };

  // For image replacement (simplified)
  private handlePhotoUploadComplete = async (photoResult: PhotoResult, existingSit?: Sit | { sitId: string; imageId: string; }) => {
    const { user, userPreferences, drawer } = this.state;
    if (!user) return;

    console.log('[App] handlePhotoUploadComplete called with existingSit:',
      existingSit ? ('id' in existingSit ? `sit ${existingSit.id}` : `image ${existingSit.imageId}`) : 'new sit');

    try {
      // Case 1: Replacing an existing image
      if (existingSit && 'imageId' in existingSit) {
        const sitId = existingSit.sitId;
        const imageId = existingSit.imageId;

        // Get the sit from Firebase only if we don't already have it
        let sit;
        if (drawer.sit && drawer.sit.id === sitId) {
          sit = drawer.sit;
        } else {
          sit = await FirebaseService.getSit(sitId);
        }

        if (!sit || !sit.imageCollectionId) throw new Error('Sit not found or has no image collection');

        // Create a temporary image with the new data
        const updatedImage: Image = {
          id: imageId,
          photoURL: '',
          userId: user.uid,
          userName: userPreferences.username,
          collectionId: sit.imageCollectionId,
          createdAt: new Date(),
          base64Data: photoResult.base64Data,
          width: photoResult.dimensions.width,
          height: photoResult.dimensions.height
        };

        // Get current images or empty array
        let currentImages = drawer.sit && drawer.sit.id === sitId ? [...drawer.images] : [];

        // Replace the image in the array
        const updatedImages = currentImages.map(img =>
          img.id === imageId ? updatedImage : img
        );

        // Close the photo modal and immediately update the drawer with optimistic data
        this.setState({
          modals: {
            ...this.state.modals,
            photo: { isOpen: false, data: null }
          },
          drawer: {
            isOpen: true,
            sit,
            images: updatedImages
          }
        });

        try {
          // Upload to server in the background
          await FirebaseService.replaceImage(
            photoResult,
            sit.imageCollectionId,
            imageId,
            user.uid,
            userPreferences.username
          );
        } catch (error: any) {
          // Show the error message to the user
          this.showNotification(error.message, 'success');
        }

        return;
      }
      // Case 2: Adding to an existing sit
      else if (existingSit && 'id' in existingSit) {
        const sit = existingSit as Sit;

        if (!sit.imageCollectionId) {
          throw new Error('Sit has no image collection');
        }

        // Create a temporary image with a unique ID
        const tempImageId = `temp_${Date.now()}`;
        const tempImage: Image = {
          id: tempImageId,
          photoURL: '',
          userId: user.uid,
          userName: userPreferences.username,
          collectionId: sit.imageCollectionId,
          createdAt: new Date(),
          base64Data: photoResult.base64Data,
          width: photoResult.dimensions.width,
          height: photoResult.dimensions.height
        };

        // Get current images or empty array
        let currentImages = drawer.sit && drawer.sit.id === sit.id ? [...drawer.images] : [];

        // Close the photo modal and immediately update the drawer with optimistic data
        this.setState({
          modals: {
            ...this.state.modals,
            photo: { isOpen: false, data: null }
          },
          drawer: {
            isOpen: true,
            sit,
            images: [...currentImages, tempImage]
          }
        });

        try {
          // Use FirebaseService to handle the upload (including offline case)
          await FirebaseService.addPhotoToSit(
            photoResult,
            sit.imageCollectionId,
            user.uid,
            userPreferences.username
          );
        } catch (error: any) {
          this.showNotification(error.message, 'error');
        }

        return;
      }
      // Case 3: Creating a new sit
      else {
        const location = photoResult.location;
        if (!location) throw new Error('No location available');

        // Create a new sit
        const initialSit = FirebaseService.createInitialSit(location, user.uid);

        // Create a temporary image
        const tempImageId = `temp_${Date.now()}`;
        const tempImage: Image = {
          id: tempImageId,
          photoURL: '',
          userId: user.uid,
          userName: userPreferences.username,
          collectionId: initialSit.imageCollectionId || '',
          createdAt: new Date(),
          base64Data: photoResult.base64Data,
          width: photoResult.dimensions.width,
          height: photoResult.dimensions.height
        };

        // Close the photo modal and immediately update the drawer with optimistic data
        this.setState({
          modals: {
            ...this.state.modals,
            photo: { isOpen: false, data: null }
          },
          drawer: {
            isOpen: true,
            sit: initialSit,
            images: [tempImage]
          },
          sits: new Map(this.state.sits).set(initialSit.id, initialSit)
        });

        try {
          // Create sit with photo using FirebaseService in the background
          const sit = await FirebaseService.createSitWithPhoto(
            photoResult,
            user.uid,
            userPreferences.username
          );

          // Replace initial sit with complete sit
          this.setState(prevState => {
            const newSits = new Map(prevState.sits);
            newSits.delete(initialSit.id);
            newSits.set(sit.id, sit);

            // Update drawer if it's showing the initial sit
            if (prevState.drawer.sit?.id === initialSit.id) {
              return {
                ...prevState,
                sits: newSits,
                drawer: {
                  ...prevState.drawer,
                  isOpen: true,
                  sit,
                  images: sit.imageCollectionId ?
                    prevState.drawer.images.map(img => ({...img, collectionId: sit.imageCollectionId || ''})) :
                    prevState.drawer.images
                }
              };
            }

            return {
              ...prevState,
              sits: newSits,
              drawer: prevState.drawer // Preserve the existing drawer state
            };
          });
        } catch (error: any) {
          // Show the error message to the user
          this.showNotification(error.message, 'success');
        }
      }
    } catch (error) {
      // Close the photo modal on error
      this.setState({
        modals: {
          ...this.state.modals,
          photo: { isOpen: false, data: null }
        }
      });

      console.error('Error uploading photo:', error);
      this.showNotification(error instanceof Error ? error.message : 'Failed to upload photo', 'error');
    }
  };

  private findNearbySit = async (coordinates: Coordinates): Promise<Sit | null> => {
    const { sits } = this.state;

    try {
      // Use ValidationUtils to check if location is valid - will throw if invalid
      ValidationUtils.isLocationValid(coordinates);

      // Check existing sits first using ValidationUtils
      for (const sit of sits.values()) {
        if (ValidationUtils.isLocationNearSit(coordinates, sit)) {
          return sit;
        }
      }

      return null; // No nearby sit found
    } catch (error) {
      // If there's a validation error, just return null
      // The caller will handle validation errors separately
      console.error('Error in findNearbySit:', error);
      throw error; // Re-throw the error to be handled by the caller
    }
  };

  private handleUploadToExisting = (sit: Sit) => {
    this.toggleNearbySitModal();
    this.togglePhotoUpload(sit);
  };

  private showNotification = (
    messageOrNotification: string | { message: string, type: 'success' | 'error' },
    type?: 'success' | 'error'
  ) => {
    const notification = Notification.getInstance();
    if (notification) {
      notification.showNotification(messageOrNotification, type);
    }
  };

  private closeNotification = () => {
    const notification = Notification.getInstance();
    if (notification) {
      notification.clearNotification();
    }
  };

  private configureStatusBar = async () => {
    try {
      // Configure dark system bars (light icons on transparent background)
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#000000' });

      // Android navigation bar is handled by native styles.xml
    } catch (e) {
      console.error('Error configuring system bars:', e);
    }
  };

  // Handle location updates from LocationService
  private handleLocationUpdate = (location: { latitude: number; longitude: number }) => {
    // Update state with new location
    this.setState({ currentLocation: location });

    // Also update LocationService's cache
    LocationService.setLastKnownLocation(location);

    // If MapComponent ref exists, update the user marker
    if (this.mapComponentRef.current) {
      this.mapComponentRef.current.updateUserLocation(location);
    }
  };

  // Add a new method to update preferences without toggling the modal
  private updatePreferences = (preferences: UserPreferences) => {
    this.setState({ userPreferences: preferences });
  };

  // Add these methods to control the drawer
  private openPopup = async (sit: Sit) => {
    console.log('[App] openPopup called with sit:', sit.id);

    // If the same sit is already open, just return without doing anything
    if (this.state.drawer.isOpen && this.state.drawer.sit?.id === sit.id) {
      // Do nothing when clicking the same marker that's already open
      return;
    }

    // Fetch images for the sit
    const images = sit.imageCollectionId
      ? await this.getImagesForSit(sit.imageCollectionId)
      : [];

    this.setState({
      drawer: {
        isOpen: true,
        sit,
        images
      }
    });
  };

  private closeDrawer = () => {
    this.setState(prevState => ({
      drawer: {
        ...prevState.drawer,
        isOpen: false
      }
    }), () => {
      console.log('[App] Drawer closed successfully');
    });
  };

  private async initializeOfflineService() {
    const offlineService = OfflineService.getInstance();
    await offlineService.initialize();

    // Add listener for network status changes
    this.offlineServiceUnsubscribe = offlineService.addStatusListener((isOnline) => {
      this.setState({ isOffline: !isOnline });

      // If we're back online, process any pending uploads
      if (isOnline) {
        this.handleProcessPendingUploads();
      }
    });

    // Also add a queue listener to update UI when queue changes
    offlineService.addQueueListener((queue) => {
      // You could update state here if you want to show pending uploads in the UI
      console.log(`[App] Pending uploads queue updated: ${queue.length} items`);
    });

    // Check if there are pending uploads that need to be processed
    if (offlineService.hasPendingUploadsToProcess()) {
      console.log('[App] Found pending uploads on startup, processing...');
      this.handleProcessPendingUploads();
    }
  }

  /**
   * Handle processing of pending uploads by showing notifications and refreshing the map
   */
  private async handleProcessPendingUploads() {
    const offlineService = OfflineService.getInstance();
    const pendingUploads = offlineService.getPendingUploads();

    if (pendingUploads.length === 0) return;

    // Show notification that we're processing uploads
    this.showNotification(`Processing ${pendingUploads.length} pending uploads...`, 'success');

    try {
      // Let the FirebaseService handle the actual processing
      await FirebaseService.processPendingUploads((uploadId, error) => {
        // Show a notification for each individual error
        this.showNotification(`Error uploading photo: ${error.message || 'Unknown error'}`, 'error');
      });

      // Refresh the map to show any new sits
      if (this.state.map) {
        const bounds = this.state.map.getBounds();
        if (bounds) {
          this.handleLoadSits({
            north: bounds.getNorth(),
            south: bounds.getSouth()
          });
        }
      }

      this.showNotification('Finished processing pending uploads', 'success');
    } catch (error) {
      console.error('[App] Error during pending uploads processing:', error);
    }
  }

  render() {
    const {
      user,
      isAuthenticated,
      authIsReady,
      map,
      sits,
      marks,
      favoriteCount,
      currentLocation,
      modals,
      userPreferences,
      isMapLoading,
      drawer,
      isOffline
    } = this.state;

    const isAndroid = Capacitor.getPlatform() === 'android';

    // Still show loading, but include the map container
    if (!authIsReady) {
      return (
        <div className="app">
          <div className="loading">Loading...</div>
          <div
            id="map-container"
            ref={this.mapContainer}
            className={isAndroid ? 'with-bottom-nav' : ''}
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    return (
      <div className="app">
        {/* Add offline banner */}
        {isOffline && (
          <div className="offline-banner">
            You are currently offline. Some features won't work.
          </div>
        )}

        <header id="app-header">
          <AuthComponent
            user={user}
            isAuthenticated={isAuthenticated}
            isProfileOpen={modals.profile.isOpen}
            userPreferences={userPreferences}
            onSignIn={this.handleSignIn}
            onSignOut={this.handleSignOut}
            onToggleProfile={this.toggleProfile}
            onSavePreferences={this.handleSavePreferences}
          />
        </header>

        <div
          id="map-container"
          ref={this.mapContainer}
          className={isAndroid ? 'with-bottom-nav' : ''}
          style={{ width: '100%' }}
        />

        {!isMapLoading && map && (
          <MapComponent
            ref={this.mapComponentRef}
            map={map}
            sits={sits}
            marks={marks}
            favoriteCount={favoriteCount}
            currentLocation={currentLocation}
            user={user}
            isLoading={isMapLoading}
            onLoadSits={this.handleLoadSits}
            onOpenPopup={this.openPopup}
          />
        )}

        {modals.photo.isOpen && (
          <PhotoUploadComponent
            isOpen={modals.photo.isOpen}
            onClose={this.togglePhotoUpload}
            onPhotoCapture={this.handlePhotoUploadComplete}
            sit={modals.photo.data || undefined}
            showNotification={this.showNotification}
          />
        )}

        {modals.profile.isOpen && (
          <ProfileModal
            isOpen={modals.profile.isOpen}
            user={user}
            preferences={userPreferences}
            onClose={this.toggleProfile}
            onSignOut={this.handleSignOut}
            onSave={this.handleSavePreferences}
            onUpdatePreferences={this.updatePreferences}
            showNotification={this.showNotification}
          />
        )}

        <AddSitButton
          isAuthenticated={isAuthenticated}
          user={user}
          onSignIn={this.handleSignIn}
          currentLocation={currentLocation}
          findNearbySit={this.findNearbySit}
          onNearbySitFound={this.toggleNearbySitModal}
          onPhotoUploadOpen={this.togglePhotoUpload}
          showNotification={this.showNotification}
        />

        <NearbyExistingSitModal
          isOpen={modals.nearbySit.isOpen}
          sit={modals.nearbySit.data}
          onClose={this.toggleNearbySitModal}
          onUploadToExisting={this.handleUploadToExisting}
        />

        <Notification />

        {drawer.sit && (
          <PopupComponent
            isOpen={drawer.isOpen}
            photoModalIsOpen={modals.photo.isOpen}
            sit={drawer.sit}
            images={drawer.images}
            user={user}
            marks={marks.get(drawer.sit.id) || new Set()}
            favoriteCount={favoriteCount.get(drawer.sit.id) || 0}
            currentLocation={currentLocation}
            onClose={this.closeDrawer}
            onToggleMark={this.handleToggleMark}
            onDeleteImage={this.handleDeleteImage}
            onReplaceImage={this.handleReplaceImage}
            onOpenPhotoModal={() => drawer.sit ? this.togglePhotoUpload(drawer.sit) : undefined}
            onOpenProfileModal={this.toggleProfile}
            onSignIn={this.handleSignIn}
          />
        )}

        {isAndroid && <div className="bottom-nav-space"></div>}
      </div>
    );
  }
}

export default App;