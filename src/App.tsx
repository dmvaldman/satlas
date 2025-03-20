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
import { App as CapacitorApp } from '@capacitor/app';

interface AppState {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  authIsReady: boolean;

  // Map state
  map: mapboxgl.Map | null;
  currentLocation: { latitude: number; longitude: number } | null;

  // Data state
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;

  // Modal state
  modals: {
    photo: {
      isOpen: boolean;
      sit?: Sit;
      replacementImageId?: string;
    };
    profile: {
      isOpen: boolean;
    };
    nearbySit: {
      isOpen: boolean;
      sit: Sit | null;
      hasUserContributed: boolean;
    };
  };

  userPreferences: UserPreferences;

  // Add drawer state
  drawer: {
    isOpen: boolean;
    sit?: Sit;
    images: Image[];
  };

  // Add this new property
  isOffline: boolean;
}

class App extends React.Component<{}, AppState> {
  private mapContainer = React.createRef<HTMLDivElement>();
  private mapComponentRef = React.createRef<MapComponent>();
  private locationService: LocationService;
  private tempImageMapping: Map<string, string | null> = new Map(); // Maps temp IDs to real Firebase IDs
  private gpsTimeoutHandle: NodeJS.Timeout | null = null;
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

      // Data state
      sits: new Map(),
      marks: new Map(),
      favoriteCount: new Map(),

      // Modal state
      modals: {
        photo: { isOpen: false },
        profile: { isOpen: false },
        nearbySit: { isOpen: false, sit: null, hasUserContributed: false }
      },

      userPreferences: {
        username: '',
        pushNotificationsEnabled: false,
        lastVisit: 0
      },

      // Initialize drawer state
      drawer: {
        isOpen: false,
        sit: undefined,
        images: []
      },

      // Initialize offline state
      isOffline: false
    };

    this.locationService = new LocationService();
  }

  componentDidMount() {
    // Run all async initializations in parallel
    Promise.all([
      this.initializeAuth(),
      this.initializeMap(),
      this.initializeOfflineService()
    ]).catch(error => {
      console.error('Initialization error:', error);
      this.showNotification('Failed to initialize app', 'error');
    });

    // Configure status bar first since it's fast
    if (Capacitor.isNativePlatform()) {
      this.configureStatusBar();
    }

    // Add location listener before initializations
    this.locationService.addLocationListener(this.handleLocationUpdate);

    // Setup deep links for web/mobile
    this.setupDeepLinks();
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

    // Clean up GPS timeout
    if (this.gpsTimeoutHandle) {
      clearTimeout(this.gpsTimeoutHandle);
    }
  }

  private initializeAuth = async () => {
    // 1. Auth setup
    this.authUnsubscribe = FirebaseService.onAuthStateChange(async (user) => {
      console.log('[App] Auth state changed:', user ? user.displayName : 'null');

      if (user) {
        this.setState({
          user,
          isAuthenticated: true,
          authIsReady: true
        });

        await this.loadUserData(user.uid);
      } else {
        this.setState({
          user: null,
          isAuthenticated: false,
          authIsReady: true
        });
      }
    });

    // 2. Direct auth check
    const currentUser = auth.currentUser;
    console.log('[App] Direct auth check on mount:', currentUser?.displayName || 'not signed in');

    this.setState({
      user: currentUser,
      isAuthenticated: !!currentUser,
      authIsReady: true  // Always make UI available
    });

    // 3. Load user data if authenticated
    if (currentUser) {
      await this.loadUserData(currentUser.uid);
    }
  };

  private initializeMap = async () => {
    console.log('Getting location');

    // Get location in background
    this.locationService.getCurrentLocation()
      .then(coordinates => {
        if (!this.mapContainer.current) return;

        const zoom = 13;
        const map = this.createMap(coordinates, zoom);

        this.setState({
          currentLocation: coordinates,
          map: map
        });
      })
      .catch(error => {
        console.error('Location error:', error);
        this.showNotification('GPS location not found. Using default map view.', 'error');

        // Center map on geographic center of America
        const coordinates = { latitude: 39.8283, longitude: -98.5795 };
        const zoom = 3;
        const map = this.createMap(coordinates, zoom);

        // poll for GPS location
        this.pollForGPSLocation();

        this.setState({
          currentLocation: coordinates,
          map: map
        });
      });
  };

  private pollForGPSLocation = () => {
    this.gpsTimeoutHandle = setTimeout(() => {
      this.locationService.getCurrentLocation()
        .then(coordinates => {
          this.showNotification('GPS location found', 'success');
          if (this.gpsTimeoutHandle) {
            clearTimeout(this.gpsTimeoutHandle);
          }
          this.gpsTimeoutHandle = null;
          this.setState({ currentLocation: coordinates });
        })
        .catch(error => {
          this.pollForGPSLocation();
        });
    }, 1000);
  };

  private createMap = (coordinates: { latitude: number; longitude: number }, zoom: number) => {
    if (!this.mapContainer.current) return null;

    const map: mapboxgl.Map = new mapboxgl.Map({
      container: this.mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [coordinates.longitude, coordinates.latitude],
      zoom: zoom
    });

    map.on('load', () => {
        console.log('Map fully loaded');
        this.locationService.startLocationTracking();

        const bounds = map.getBounds();
        console.log('Map Bounds:', bounds);
        if (bounds) {
          this.handleLoadSits({
            north: bounds.getNorth(),
            south: bounds.getSouth()
          });
        }
      });

      // Add moveend handler
      map.on('moveend', () => {
        const bounds = map.getBounds();
        console.log('Map Bounds:', bounds);
        if (bounds) {
          this.handleLoadSits({
            north: bounds.getNorth(),
            south: bounds.getSouth()
          });
        }
      });

      map.addControl(new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: false
        },
        trackUserLocation: true
      }), 'bottom-left');

    return map;
  };

  private initializeOfflineService = async () => {
    const offlineService = OfflineService.getInstance();
    await offlineService.initialize();

    // Keep existing offline service listener logic
    let lastKnownNetworkState = offlineService.isNetworkOnline();
    this.offlineServiceUnsubscribe = offlineService.addStatusListener(async (isOnline) => {
      console.log('[App] Network status changed:', isOnline ? 'online' : 'offline');

      // Check if this is a real network change or just the app coming back to foreground
      const isRealNetworkChange = (lastKnownNetworkState !== isOnline);
      lastKnownNetworkState = isOnline;

      if (!isRealNetworkChange) {
        console.log('[App] Not a real network change, likely app lifecycle event. Ignoring.');
        return;
      }

      // If we're going offline, update the UI immediately
      if (!isOnline) {
        this.setState({ isOffline: true });
        return;
      }

      // If we're coming back online, don't update the UI state immediately
      // First check authentication state to prevent momentary logout
      console.log('[App] Back online, checking authentication before updating UI');

      try {
        // Check if we have a current user in Firebase
        const currentUser = auth.currentUser;

        if (currentUser) {
          console.log('[App] Found Firebase user, updating state with user:', currentUser.uid);

          // Update state with the current user and set offline to false in one update
          // This prevents the momentary logout
          this.setState({
            user: currentUser,
            isAuthenticated: true,
            isOffline: false
          }, () => {
            // Now process uploads with the authenticated user
            console.log('[App] Processing pending uploads with authenticated user');
            this.handleProcessPendingUploads();
          });
        }
      } catch (error) {
        console.error('[App] Error during network status change handling:', error);
        // Still update offline state even if there was an error
        this.setState({ isOffline: false });
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
        return {
          modals: {
            ...prevState.modals,
            photo: {
              isOpen: true,
              sit: sit
            }
          }
        };
      }
      // If we're closing the photo modal
      else {
        return {
          modals: {
            ...prevState.modals,
            photo: { isOpen: false }
          }
        };
      }
    });
  };

  private toggleNearbySitModal = async (sit: Sit) => {
    // If we're opening the modal with a sit
    if (!this.state.modals.nearbySit.isOpen) {
      // Fetch images for the sit if it has an image collection
      const images = await FirebaseService.getImages(sit.imageCollectionId);
      const hasUserContributed = images.some(image => image.userId === this.state.user?.uid);

      // Now open the modal with the sit and whether the user has contributed
      this.setState(prevState => ({
        modals: {
          ...prevState.modals,
          nearbySit: {
            isOpen: true,
            sit: sit,
            hasUserContributed: hasUserContributed
          }
        }
      }));
    } else {
      // We're closing the modal or opening it without a sit
      this.setState(prevState => ({
        modals: {
          ...prevState.modals,
          nearbySit: {
            isOpen: !prevState.modals.nearbySit.isOpen,
            sit: null,
            hasUserContributed: false
          }
        }
      }));
    }
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
    const { sits, marks, favoriteCount, user, isOffline } = this.state;
    if (!user) return;

    if (isOffline) {
      this.showNotification('You are currently offline. Feature disabled.', 'error');
      return;
    }

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

    // Optimistically update UI first
    if (drawer.sit && drawer.sit.id === sitId) {
      const updatedImages = drawer.images.filter(img => img.id !== imageId);

      // If this was the last image, close the drawer
      if (updatedImages.length === 0) {
        this.setState({
          drawer: {
            isOpen: false,
            sit: undefined,
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

    if (isOffline) {
      // If we're offline, queue the deletion
      const offlineService = OfflineService.getInstance();
      await offlineService.addPendingImageDeletion(
        imageId,
        user.uid,
        this.state.userPreferences.username
      );
      this.showNotification('Image will be deleted when you\'re back online', 'success');
    }
    else {
      this.deleteImage(sitId, imageId);
    }
  };

  private deleteImage = async (sitId: string, imageId: string) => {
    const { user, drawer } = this.state;
    if (!user) return;

    // Check if this is a temporary image (starts with 'temp_')
    const isTemporaryImage = imageId.startsWith('temp_');

    if (isTemporaryImage) {
      const realImageId = this.tempImageMapping.get(imageId);
      if (!realImageId) {
        console.error('No real image ID found for temporary image:', imageId);
        return;
      }

      // Remove the mapping from temp ID to real Firebase ID
      this.tempImageMapping.delete(imageId);
      imageId = realImageId;
    }

    try {
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
  };

  private handleReplaceImage = async (sitId: string, imageId: string) => {
    const { drawer } = this.state;

    // Get the sit from Firebase only if we don't already have it
    let sit;
    if (drawer.sit && drawer.sit.id === sitId) {
      sit = drawer.sit;
    } else {
      sit = await FirebaseService.getSit(sitId);
    }

    if (!sit) throw new Error('Sit not found');

    // Open photo upload modal with replacement data
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        photo: { isOpen: true, sit: sit, replacementImageId: imageId }
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

  private handlePhotoUploadComplete = async (photoResult: PhotoResult, existingSit?: Sit, replacementImageId?: string) => {
    const { user, userPreferences, drawer } = this.state;
    if (!user) return;

    try {
      // Case 1: Replacing an existing image
      if (existingSit && replacementImageId) {
        const sit = existingSit as Sit;

        // Create a temporary image with the new data
        const tempImage = this.createTemporaryImage(
          photoResult,
          sit.imageCollectionId,
          user.uid,
          userPreferences.username
        );

        // Replace the image in the array
        const updatedImages = drawer.images.map(img =>
          img.id === replacementImageId ? tempImage : img
        );

        // Close the photo modal and immediately update the drawer with optimistic data
        this.setState({
          modals: {
            ...this.state.modals,
            photo: { isOpen: false }
          },
          drawer: {
            isOpen: true,
            sit: sit,
            images: updatedImages
          }
        });

        try {
          const isTemporaryImage = replacementImageId.startsWith('temp_');

          if (isTemporaryImage) {
            const realImageId = this.tempImageMapping.get(replacementImageId);
            if (!realImageId) {
              console.error('No real image ID found for temporary image:', replacementImageId);
              return;
            }
            replacementImageId = realImageId;
            this.tempImageMapping.delete(replacementImageId);
          }

          // Upload to server in the background
          const replacedImage = await FirebaseService.replaceImage(
            photoResult,
            sit.imageCollectionId,
            replacementImageId,
            user.uid,
            userPreferences.username
          );

          this.tempImageMapping.set(tempImage.id, replacedImage.id);
        } catch (error: any) {
          // Show the error message to the user
          this.showNotification(error.message, 'error');
        }

        return;
      }
      // Case 2: Adding to an existing sit
      else if (existingSit) {
        const sit = existingSit as Sit;

        if (!sit.imageCollectionId) {
          throw new Error('Sit has no image collection');
        }

        // Create a temporary image with a unique ID
        const tempImage = this.createTemporaryImage(
          photoResult,
          sit.imageCollectionId,
          user.uid,
          userPreferences.username
        );

        // Close the photo modal and immediately update the drawer with optimistic data
        this.setState({
          modals: {
            ...this.state.modals,
            photo: { isOpen: false }
          },
          drawer: {
            isOpen: true,
            sit,
            images: [...drawer.images, tempImage]
          }
        });

        try {
          // Use FirebaseService to handle the upload (including offline case)
          const uploadedImage = await FirebaseService.addPhotoToSit(
            photoResult,
            sit.imageCollectionId,
            user.uid,
            userPreferences.username
          );

          // Store mapping from temp ID to real Firebase ID
          this.tempImageMapping.set(tempImage.id, uploadedImage.id);
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
        const initialSit = {
          id: `new_${Date.now()}`,
          location: location,
          uploadedBy: user.uid,
          imageCollectionId: ''
        };

        // Create a temporary image
        const tempImage = this.createTemporaryImage(
          photoResult,
          initialSit.imageCollectionId || '',
          user.uid,
          userPreferences.username
        );

        // Close the photo modal and immediately update the drawer with optimistic data
        this.setState({
          modals: {
            ...this.state.modals,
            photo: { isOpen: false }
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
          const { sit, image } = await FirebaseService.createSitWithPhoto(
            photoResult,
            user.uid,
            userPreferences.username
          );
          this.tempImageMapping.set(tempImage.id, image.id);
          console.log(`Mapped temp image ${tempImage.id} to Firebase ID ${image.id}`);


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
                  sit,
                  images: sit.imageCollectionId ?
                    prevState.drawer.images.map(img => ({...img, collectionId: sit.imageCollectionId || ''})) :
                    prevState.drawer.images
                }
              };
            }

            return {
              ...prevState,
              sits: newSits
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
          photo: { isOpen: false }
        }
      });

      console.error('Error uploading photo:', error);
      this.showNotification(error instanceof Error ? error.message : 'Failed to upload photo', 'error');
    }
  };

  private createTemporaryImage = (photoResult: PhotoResult, imageCollectionId: string, userId: string, userName: string) => {
    const tempImageId = `temp_${Date.now()}`;
    const tempImage: Image = {
      id: tempImageId,
      photoURL: '',
      userId: userId,
      userName: userName,
      collectionId: imageCollectionId,
      createdAt: new Date(),
      base64Data: photoResult.base64Data,
      width: photoResult.dimensions.width,
      height: photoResult.dimensions.height
    };

    // Store mapping from temp ID to real Firebase ID
    this.tempImageMapping.set(tempImageId, null);
    console.log(`Mapped temp image ${tempImageId} to null`);

    return tempImage;
  }

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
    this.toggleNearbySitModal(sit);
    this.togglePhotoUpload(sit);
  };

  private showNotification = (
    message: string,
    type: 'success' | 'error'
  ) => {
    const notification = Notification.getInstance();
    if (notification) {
      notification.showNotification(message, type);
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

      this.showNotification('Finished processing pending uploads', 'success');
    } catch (error) {
      console.error('[App] Error during pending uploads processing:', error);
    }
  }

  private setupDeepLinks() {
    // Check URL parameters on web
    if (!Capacitor.isNativePlatform()) {
      const urlParams = new URLSearchParams(window.location.search);
      const sitId = urlParams.get('sitId');
      if (sitId) {
        this.openSitById(sitId);
      }
    }
    else {
      CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
        console.log('App opened with URL:', url);

        // Parse the URL to extract the sit ID
        // Example URL format: yourapp://sit/123456
        try {
          const urlObj = new URL(url);
          const pathSegments = urlObj.pathname.split('/').filter(Boolean);

          if (pathSegments[0] === 'sit' && pathSegments[1]) {
            const sitId = pathSegments[1];
            this.openSitById(sitId);
          }
        } catch (error) {
          console.error('Error handling deep link:', error);
        }
      });
    }
  }

  private async openSitById(sitId: string) {
    try {
      // Fetch the sit data from Firebase
      const sit = await FirebaseService.getSit(sitId);

      if (sit) {
        // If the sit was found, open its popup
        this.openPopup(sit);

        // If the map is loaded, center it on the sit
        if (this.state.map) {
          this.state.map.flyTo({
            center: [sit.location.longitude, sit.location.latitude],
            zoom: 15
          });
        }
      } else {
        this.showNotification('Sit not found', 'error');
      }
    } catch (error) {
      console.error('Error opening sit by ID:', error);
      this.showNotification('Failed to load sit', 'error');
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
      drawer,
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
        <header id="app-header">
          <AuthComponent
            user={user}
            isAuthenticated={isAuthenticated}
            userPreferences={userPreferences}
            onSignIn={this.handleSignIn}
            onToggleProfile={this.toggleProfile}
            onUpdatePreferences={this.updatePreferences}
            onSavePreferences={this.handleSavePreferences}
            showNotification={this.showNotification}
          />
        </header>

        <div
          id="map-container"
          ref={this.mapContainer}
          className={isAndroid ? 'with-bottom-nav' : ''}
          style={{ width: '100%' }}
        />

        {!map && (
          <div className="map-loading">
            <div className="spinner"></div>
          </div>
        )}

        {map && (
          <MapComponent
            ref={this.mapComponentRef}
            map={map}
            sits={sits}
            marks={marks}
            favoriteCount={favoriteCount}
            currentLocation={currentLocation}
            user={user}
            onLoadSits={this.handleLoadSits}
            onOpenPopup={this.openPopup}
          />
        )}

        <PhotoUploadComponent
          isOpen={modals.photo.isOpen}
          onClose={this.togglePhotoUpload}
          onPhotoCapture={this.handlePhotoUploadComplete}
          sit={modals.photo.sit}
          replacementImageId={modals.photo.replacementImageId}
          showNotification={this.showNotification}
        />

        <ProfileModal
          isOpen={modals.profile.isOpen}
          user={user}
          preferences={userPreferences}
          currentLocation={currentLocation}
          onClose={this.toggleProfile}
          onSignOut={this.handleSignOut}
          onSave={this.handleSavePreferences}
          onUpdatePreferences={this.updatePreferences}
          showNotification={this.showNotification}
        />

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
          sit={modals.nearbySit.sit}
          hasUserContributed={modals.nearbySit.hasUserContributed}
          onClose={this.toggleNearbySitModal}
          onUploadToExisting={this.handleUploadToExisting}
        />

        <Notification />

        <PopupComponent
          isOpen={drawer.isOpen}
          photoModalIsOpen={modals.photo.isOpen}
          sit={drawer.sit}
          images={drawer.images}
          user={user}
          marks={marks.get(drawer.sit?.id || '') || new Set()}
          favoriteCount={favoriteCount.get(drawer.sit?.id || '') || 0}
          currentLocation={currentLocation}
          onClose={this.closeDrawer}
          onToggleMark={this.handleToggleMark}
          onDeleteImage={this.handleDeleteImage}
          onReplaceImage={this.handleReplaceImage}
          onOpenPhotoModal={() => this.togglePhotoUpload(drawer.sit)}
          onOpenProfileModal={this.toggleProfile}
          onSignIn={this.handleSignIn}
        />

        {isAndroid && <div className="bottom-nav-space"></div>}
      </div>
    );
  }
}

export default App;