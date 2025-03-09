import React from 'react';
import mapboxgl from 'mapbox-gl';
import { User } from 'firebase/auth';
import AuthComponent from './components/AuthComponent';
import MapComponent from './components/MapComponent';
import { Image, Sit, Coordinates, MarkType } from './types';
import { getDistanceInFeet } from './utils/geo';
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
import { BottomSheet } from 'react-spring-bottom-sheet'
import 'react-spring-bottom-sheet/dist/style.css'

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
      data: any | null;
    };
    nearbySit: {
      isOpen: boolean;
      data: Sit | null;
    };
  };

  // Notification state
  notification: {
    message: string;
    type: 'success' | 'error';
    isVisible: boolean;
  } | null;

  userPreferences: UserPreferences;

  // Add drawer state
  drawer: {
    isOpen: boolean;
    sit: Sit | null;
    images: Image[];
  };
}

type PhotoResult = {
  base64Data: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  dimensions?: {
    width: number;
    height: number;
  };
};

class App extends React.Component<{}, AppState> {
  private mapContainer = React.createRef<HTMLDivElement>();
  private mapComponentRef = React.createRef<MapComponent>();
  private locationService: LocationService;
  private authUnsubscribe: (() => void) | null = null;

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
        profile: { isOpen: false, data: null },
        nearbySit: { isOpen: false, data: null }
      },

      // Notification state
      notification: null,

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
        this.loadAndSetUserPreferences(user.uid);
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
      this.loadAndSetUserPreferences(currentUser.uid);
    }

    // Initialize map after component is mounted
    this.initializeMap();

    // Set up location listener
    this.locationService.addLocationListener(this.handleLocationUpdate);
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
            this.handleLoadNearbySits({
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
            this.handleLoadNearbySits({
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

  // Helper method to create the location dot element
  private createLocationDot(): HTMLElement {
    // Create a simple container with the right class
    const container = document.createElement('div');
    container.className = 'custom-location-marker';
    return container;
  }

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
        this.handleLoadNearbySits({
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
      this.setState({
        marks: marksMap,
        favoriteCount: favoriteCounts
      });
    } catch (error) {
      console.error('Error loading user marks:', error);
    }
  }

  private loadUserPreferences = async (userId: string): Promise<UserPreferences> => {
    try {
      const userData = await FirebaseService.loadUserPreferences(userId);
      this.setState({ userPreferences: userData });
      return userData;
    } catch (error) {
      console.error('Error loading user preferences:', error);
      throw error;
    }
  };

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
            const preferences = await this.loadUserPreferences(currentUser.uid);
            console.log('[App] User preferences loaded after sign-in:', preferences);
          } catch (error) {
            console.error('[App] Error loading preferences after sign-in:', error);
          }
        });
      }
    } catch (error) {
      console.error('[App] Sign-in error:', error);
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
              isOpen: false,
              data: null
            }
          }
        };
      }

      // Otherwise, toggle it normally
      return {
        modals: {
          ...prevState.modals,
          profile: {
            isOpen: !prevState.modals.profile.isOpen,
            data: prevState.modals.profile.data
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

  private handleLoadNearbySits = async (bounds: { north: number; south: number }) => {
    try {
      const newSits = await FirebaseService.loadNearbySits(bounds);

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
    const { user, sits, drawer } = this.state;
    if (!user) throw new Error('Must be logged in to delete images');

    const sit = sits.get(sitId);
    if (!sit) throw new Error('Sit not found');

    try {
      // Check if this is a temporary image (starts with 'temp_')
      const isTemporaryImage = imageId.startsWith('temp_');

      // Optimistically update UI first
      if (drawer.sit && drawer.sit.id === sitId) {
        const updatedImages = drawer.images.filter(img => img.id !== imageId);
        this.setState(prevState => ({
          drawer: {
            ...prevState.drawer,
            images: updatedImages
          }
        }));
      }

      // If it's a temporary image, we don't need to delete it from the server
      if (!isTemporaryImage) {
        try {
          // Try to delete from server
          await FirebaseService.deleteImage(imageId, user.uid);
        } catch (error) {
          console.error('Error deleting image:', error);

          // If server deletion fails but it's a local image with base64Data,
          // we can consider the deletion successful for the UI
          const hasLocalBase64 = drawer.images.some(img =>
            img.id === imageId && img.base64Data
          );

          if (!hasLocalBase64) {
            // Only revert UI and show error if it's not a local image with base64
            if (drawer.sit && drawer.sit.id === sitId) {
              // Revert the UI change
              const originalImages = await this.getImagesForSit(sit.imageCollectionId!);
              this.setState(prevState => ({
                drawer: {
                  ...prevState.drawer,
                  images: originalImages
                }
              }));
            }
            throw error;
          }
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
          width: photoResult.dimensions?.width,
          height: photoResult.dimensions?.height
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

        // Upload to server in the background
        FirebaseService.replaceImage(
          photoResult.base64Data,
          sit.imageCollectionId,
          imageId,
          user.uid,
          userPreferences.username
        ).catch(error => {
          console.error('Background upload failed:', error);
          this.showNotification('Image upload failed in the background', 'error');
        });

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
          width: photoResult.dimensions?.width,
          height: photoResult.dimensions?.height
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

        // Upload to server in the background
        FirebaseService.addPhotoToSit(
          photoResult.base64Data,
          sit.imageCollectionId,
          user.uid,
          userPreferences.username
        ).catch(error => {
          console.error('Background upload failed:', error);
          this.showNotification('Image upload failed in the background', 'error');
        });

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
          width: photoResult.dimensions?.width,
          height: photoResult.dimensions?.height
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

        // Create sit with photo using FirebaseService in the background
        FirebaseService.createSitWithPhoto(
          photoResult.base64Data,
          location,
          user.uid,
          userPreferences.username
        ).then(sit => {
          // Replace initial sit with complete sit
          this.setState(prevState => {
            const newSits = new Map(prevState.sits);
            newSits.delete(initialSit.id);
            newSits.set(sit.id, sit);

            // Update drawer if it's showing the initial sit
            if (prevState.drawer.sit?.id === initialSit.id) {
              return {
                sits: newSits,
                drawer: {
                  isOpen: true,
                  sit,
                  images: sit.imageCollectionId ?
                    prevState.drawer.images.map(img => ({...img, collectionId: sit.imageCollectionId || ''})) :
                    prevState.drawer.images
                }
              };
            }

            return { sits: newSits };
          });
        }).catch(error => {
          console.error('Background upload failed:', error);
          this.showNotification('Sit creation failed in the background', 'error');
        });
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

    // Check existing sits first
    for (const sit of sits.values()) {
      if (getDistanceInFeet(coordinates, sit.location) < 100) {
        return sit;
      }
    }

    // If not found in current sits, check database using FirebaseService
    try {
      const allSits = await FirebaseService.loadNearbySits({
        north: coordinates.latitude + 0.001, // Roughly 100 meters
        south: coordinates.latitude - 0.001
      });

      for (const sit of allSits.values()) {
        if (getDistanceInFeet(coordinates, sit.location) < 100) {
          return sit;
        }
      }
    } catch (error) {
      console.error('Error finding nearby sit:', error);
    }

    return null;
  };

  private handleUploadToExisting = (sit: Sit) => {
    this.toggleNearbySitModal();
    this.togglePhotoUpload(sit);
  };

  private showNotification = (message: string, type: 'success' | 'error') => {
    this.setState({
      notification: { message, type, isVisible: true }
    }, () => {
      setTimeout(() => {
        if (this.state.notification?.isVisible) {
          this.setState({ notification: null });
        }
      }, 6000);
    });
  };

  private closeNotification = () => {
    this.setState({ notification: null });
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
  private openDrawer = async (sit: Sit) => {
    console.log('[App] openDrawer called with sit:', sit.id);

    // If the same sit is already open, don't close it when coming from photo upload
    if (this.state.drawer.isOpen && this.state.drawer.sit?.id === sit.id &&
        !this.state.modals.photo.isOpen && !this.state.modals.photo.data) {
      this.closeDrawer();
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

  // Helper method to load and set user preferences
  private loadAndSetUserPreferences = async (userId: string) => {
    try {
      console.log('[App] Loading preferences for user:', userId);
      const preferences = await this.loadUserPreferences(userId);
      console.log('[App] User preferences loaded:', preferences);

      // Also load user marks
      const marks = await FirebaseService.loadUserMarks(userId);

      this.setState({
        userPreferences: preferences,
        marks
      });
    } catch (error) {
      console.error('[App] Error loading user preferences:', error);
    }
  };

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
      notification,
      drawer
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
        <header className="app-header">
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
            onLoadNearbySits={this.handleLoadNearbySits}
            onToggleMark={this.handleToggleMark}
            onDeleteImage={this.handleDeleteImage}
            onReplaceImage={this.handleReplaceImage}
            getImagesForSit={this.getImagesForSit}
            onOpenPhotoModal={this.togglePhotoUpload}
            onOpenProfileModal={this.toggleProfile}
            onOpenDrawer={this.openDrawer}
            getCurrentSitId={() => this.state.drawer.sit?.id || null}
          />
        )}

        {modals.photo.isOpen && (
          <PhotoUploadComponent
            isOpen={modals.photo.isOpen}
            onClose={this.togglePhotoUpload}
            onPhotoCapture={this.handlePhotoUploadComplete}
            sit={modals.photo.data || undefined}
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

        {notification && (
          <div className={`notification ${notification.type}`}>
            <span className="notification-message">{notification.message}</span>
            <button
              className="notification-close"
              onClick={this.closeNotification}
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        )}

        {drawer.sit && (
          <BottomSheet
            open={drawer.isOpen && !modals.photo.isOpen}
            onDismiss={this.closeDrawer}
            snapPoints={({ minHeight }) => [
              minHeight,
              Math.min(500, window.innerHeight * 0.6),
              Math.min(700, window.innerHeight * 0.8)
            ]}
            expandOnContentDrag={false}
            defaultSnap={({ minHeight }) => minHeight}
            header={
              <div className="bottom-sheet-header">
                <span className="header-emoji">🪑</span>
              </div>
            }
          >
            <PopupComponent
              sit={drawer.sit}
              images={drawer.images}
              user={user}
              marks={marks.get(drawer.sit.id) || new Set()}
              favoriteCount={favoriteCount.get(drawer.sit.id) || 0}
              currentLocation={currentLocation}
              onToggleMark={this.handleToggleMark}
              onDeleteImage={this.handleDeleteImage}
              onReplaceImage={this.handleReplaceImage}
              onOpenPhotoModal={() => this.togglePhotoUpload(drawer.sit)}
              onOpenProfileModal={this.toggleProfile}
              onClose={this.closeDrawer}
            />
          </BottomSheet>
        )}

        {isAndroid && <div className="bottom-nav-space"></div>}
      </div>
    );
  }
}

export default App;