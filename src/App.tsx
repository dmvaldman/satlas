import React from 'react';
import mapboxgl from 'mapbox-gl';
import { User } from 'firebase/auth';
import * as Sentry from "@sentry/react";
import AuthComponent from './components/AuthButton';
import MapComponent from './components/Map';
import { Image, Sit, Location, MarkType, PhotoResult } from './types';
import PhotoUploadModal from './components/PhotoUploadModal';
import ProfileModal from './components/ProfileModal';
import { UserPreferences, PhotoModalState } from './types';
import AddSitButton from './components/AddSitButton';
import NearbySitModal from './components/NearbySitModal';
import { FirebaseService } from './services/FirebaseService';
import { LocationService } from './services/LocationService';
import Notifications, { NotificationType } from './components/Notifications';
import { auth } from './services/FirebaseService';
import { StatusBar, Style } from '@capacitor/status-bar';
import { EdgeToEdge } from '@capawesome/capacitor-android-edge-to-edge-support';
import { Capacitor } from '@capacitor/core';
import SitComponent from './components/Sit';
import { OfflineService, OfflineSuccess } from './services/OfflineService';
import { ValidationUtils, SitTooCloseError } from './utils/ValidationUtils';
import { App as CapacitorApp } from '@capacitor/app';
import FullscreenImage from './components/FullscreenImage';
import { SplashScreen } from '@capacitor/splash-screen';
import { debounce } from './utils/debounce';
import SignInModal from './components/SignInModal';
import packageJson from '../package.json';
import ViewToggle, { ViewType } from './components/ViewToggle';
import GalleryView from './components/GalleryView';
import EditLocationModal from './components/EditLocationModal'; // Import EditLocationModal

interface AppState {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;

  // Map state
  map: mapboxgl.Map | null;
  currentLocation: Location | null;

  // Data state
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
  seenSits: Set<string>;

  // Modal state
  modals: {
    photo: {
      isOpen: boolean;
      state: PhotoModalState;
      sitId?: string;
      replacementImageId?: string;
    };
    profile: {
      isOpen: boolean;
    };
    nearbySit: {
      isOpen: boolean;
      sitId: string | null;
      hasUserContributed: boolean;
      imageId?: string;
    };
    fullscreenImage: {
      isOpen: boolean;
      image: Image | null;
    };
    signIn: {
      isOpen: boolean;
      message?: string;
    };
  };

  userPreferences: UserPreferences;
  drawer: {
    isOpen: boolean;
    sit?: Sit;
    images: Image[];
  };
  isOffline: boolean;
  currentView: ViewType;
  initialLoadTimestampMs?: number | null;

  // Manual location editing state
  isManualLocationEditing: boolean;
  photoForManualLocation: Omit<PhotoResult, 'location'> | null;
  manualLocationOriginalModalProps: { sitId?: string; replacementImageId?: string; } | null;
  showEditLocationModal: boolean; // New state for EditLocationModal
}

class App extends React.Component<{}, AppState> {
  private mapContainer = React.createRef<HTMLDivElement>();
  private mapComponentRef = React.createRef<MapComponent>();
  private notificationsRef = React.createRef<Notifications>();
  private locationService: LocationService;
  private initialLoadTimestampMs: number | null = null;
  private authUnsubscribe: (() => void) | null = null;
  private offlineServiceUnsubscribe: (() => void) | null = null;
  private firebaseListenersUnsubscribe: (() => void) | null = null;

  constructor(props: {}) {
    super(props);

    this.state = {
      // Auth state
      user: null,
      isAuthenticated: false,

      // Map state
      map: null,
      currentLocation: null,

      // Data state
      sits: new Map(),
      marks: new Map(),
      favoriteCount: new Map(),
      seenSits: new Set<string>(),

      // Modal state
      modals: {
        photo: { isOpen: false, state: 'none' },
        profile: { isOpen: false },
        nearbySit: { isOpen: false, sitId: null, hasUserContributed: false, imageId: undefined },
        fullscreenImage: { isOpen: false, image: null },
        signIn: { isOpen: false }
      },

      userPreferences: {
        username: '',
        pushNotificationsEnabled: false,
        lastVisit: 0,
        username_lowercase: ''
      },
      drawer: {
        isOpen: false,
        sit: undefined,
        images: []
      },
      isOffline: false,
      currentView: 'map',

      // Manual location editing state
      isManualLocationEditing: false,
      photoForManualLocation: null,
      manualLocationOriginalModalProps: null,
      showEditLocationModal: false, // Initialize new state
    };

    this.locationService = new LocationService();

    // Capture timestamp (milliseconds) BEFORE setting up listeners
    this.initialLoadTimestampMs = Date.now(); // Use Date.now()
  }

  componentDidMount() {
    console.log('[App] Component mounted');
    window.__version__ = packageJson.version;

    // Add location listener before initializations
    this.locationService.onLocationUpdate(this.handleLocationUpdate);

    // Run all async initializations in parallel
    Promise.all([
      this.initializeAuth(),
      this.initializeMap(),
      this.initializeOfflineService()
    ]).catch(error => {
      console.error('[App] Initialization error during Promise.all:', error);
      this.showNotification('Failed to initialize app', 'error');
    });

    // Configure status bar first since it's fast
    if (Capacitor.isNativePlatform()) {
      // Configure status bar
      this.configureStatusBar();

      try {
        SplashScreen.hide(); // Fire and forget
      } catch (e) {
        console.error('[App] Error hiding splash screen:', e);
      }

      // Add resume listener for native platforms
      CapacitorApp.addListener('resume', () => {
        console.log('[App] App resumed from background');
        // Always try to start tracking on resume. LocationService handles if already tracking.
        this.locationService.startTracking();

        // Fly map ONLY if we have a map, a location AND the drawer is closed
        if (this.state.map && this.state.currentLocation && !this.state.drawer.isOpen) {
          this.state.map.flyTo({
            center: [this.state.currentLocation.longitude, this.state.currentLocation.latitude],
            zoom: 13, // Or maintain current zoom? Let's stick to 13.
            duration: 1000,
            essential: true
          });
        }
      });

      // Add pause listener to track when app goes to background
      CapacitorApp.addListener('pause', () => {
        console.log('[App] App paused, going to background');
        console.log('[App] Current auth state:', {
          hasUser: !!this.state.user,
          userId: this.state.user?.uid,
          firebaseUser: auth.currentUser?.uid
        });
      });
    }

    // Setup deep links for web/mobile
    this.setupDeepLinks();

    // Synchronize Firebase sit/mark listeners
    this.setupRealtimeListeners();
  }

  componentWillUnmount() {
    // Clean up map when component unmounts
    if (this.state.map) {
      this.state.map.remove();
    }

    // Clean up location tracking
    this.locationService.offLocationUpdate(this.handleLocationUpdate);
    this.locationService.stopTracking();

    // Clean up app resume listener
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.removeAllListeners();
    }

    // Clean up auth listener
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
    }

    // Clean up offline service listener
    if (this.offlineServiceUnsubscribe) {
      this.offlineServiceUnsubscribe();
    }

    // Clean up Firebase listeners
    if (this.firebaseListenersUnsubscribe) {
      this.firebaseListenersUnsubscribe();
    }
  }

  private initializeAuth = async () => {
    console.log('[App] Starting auth initialization');

    // 1. Auth setup
    this.authUnsubscribe = FirebaseService.onAuthStateChange(async (user) => {
      console.log('[App] Auth state changed:', user ? user.displayName : 'null');

      if (user) {
        this.handleSignIn(user);
      } else {
        console.log('[App] Setting unauthenticated state');
        this.setState({
          user: null,
          isAuthenticated: false
        });
      }
    });

    // 2. Direct auth check
    const currentUser = auth.currentUser;
    if (currentUser) {
      this.handleSignIn(currentUser);
    }
  };

  private initializeMap = async () => {
    console.log('[App] Initializing Map...');

    let initialCoordinates: Location | null = null;
    let mapCenter: Location;
    let mapZoom: number;

    try {
      console.log('[App] Attempting to get initial location...');
      initialCoordinates = await this.locationService.getCurrentLocation();
      console.log('[App] Initial location obtained:', initialCoordinates);
      mapCenter = initialCoordinates;
      mapZoom = 13;
      this.setState({ currentLocation: initialCoordinates });
    } catch (error) {
      console.warn('[App] Initial location failed:', error);
      const lastKnown = LocationService.getLastKnownLocation();
      if (lastKnown) {
        console.log('[App] Using last known location for initial map center:', lastKnown);
        mapCenter = lastKnown;
        mapZoom = 13;
        this.setState({ currentLocation: lastKnown });
      } else if (this.state.userPreferences.cityCoordinates) {
        console.log('[App] Using user preference city for initial map center');
        mapCenter = this.state.userPreferences.cityCoordinates;
        mapZoom = 11;
      } else {
        console.log('[App] Using default US center for initial map');
        mapCenter = { latitude: 39.8283, longitude: -98.5795 }; // US Center
        mapZoom = 3;
      }
    }

    if (!this.mapContainer.current) {
      console.error('[App] Map container not found!');
      return;
    }

    const map: mapboxgl.Map = new mapboxgl.Map({
      container: this.mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [mapCenter.longitude, mapCenter.latitude],
      zoom: mapZoom
    });

    map.once('idle', () => {
      console.log('[App] Map loaded.');
      this.setState({ map: map }, async () => {
        console.log('[App] Starting location tracking after map load.');
        this.locationService.startTracking();

        const bounds = map.getBounds();
        console.log('Initial Map Bounds:', bounds);
        if (bounds) {
          // Get the count of sits loaded in the initial view
          const loadedSitsCount = await this.handleLoadSits({ north: bounds.getNorth(), south: bounds.getSouth() });

          // Check if sits map is empty after initial load
          if (loadedSitsCount === 0) {
            this.showNotification("No sits in this area — create the first!", 'success');
          }
        }
      });
    });
  };

  private initializeOfflineService = async () => {
    const offlineService = OfflineService.getInstance();
    await offlineService.initialize();

    // Keep existing offline service listener logic
    let lastKnownNetworkState = offlineService.isNetworkOnline();

    // Create a debounced handler for network status changes
    const networkHandler = debounce(async (isOnline: boolean) => {
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

      const { user, isAuthenticated } = this.state;
      console.log('[App] Current auth state - hasUser:', !!user, 'isAuthenticated:', isAuthenticated, 'userId:', user?.uid, 'currentUser:', auth.currentUser);

      try {
        // If we have a valid user in state, trust it when coming back online
        // This prevents unnecessary state updates while Firebase reinitializes
        if (user && isAuthenticated) {
          console.log('[App] Have valid user in state, using it for pending uploads');
          this.setState({ isOffline: false }, () => {
            console.log('[App] Processing pending uploads with existing user state');
            this.handleProcessPendingUploads();
          });
          return;
        }

        // Only check Firebase auth if we don't have a valid user in state
        const currentUser = auth.currentUser;
        if (currentUser) {
          console.log('[App] Found Firebase user, updating state with user:', currentUser.uid);
          this.setState({
            user: currentUser,
            isAuthenticated: true,
            isOffline: false
          }, () => {
            console.log('[App] Processing pending uploads with authenticated user');
            this.handleProcessPendingUploads();
          });
        } else {
          // If we don't have a user in state and Firebase is null, we're logged out
          console.log('[App] No user found in Firebase, updating state to logged out');
          this.setState({
            user: null,
            isAuthenticated: false,
            isOffline: false
          });
        }
      } catch (error) {
        console.error('[App] Error during network status change handling:', error);
        // Still update offline state even if there was an error
        this.setState({ isOffline: false });
      }
    }, 100); // 100ms debounce

    this.offlineServiceUnsubscribe = offlineService.addStatusListener(networkHandler);
  };

  private async loadUserData(user: User) {
    const userId = user.uid;
    try {
      const marksMap = await FirebaseService.loadUserMarks(userId);
      const favoriteCounts = await FirebaseService.loadFavoriteCounts();
      const userData = await FirebaseService.loadUserPreferences(userId, user.displayName);
      const seenSits = await FirebaseService.getUserSeenSits(userId);

      this.setState({
        marks: marksMap,
        favoriteCount: favoriteCounts,
        userPreferences: userData,
        seenSits: seenSits
      });
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  // Auth methods
  private handleSignInModalOpen = async (message?: string) => {
    this.setState({
      modals: {
        ...this.state.modals,
        signIn: { isOpen: true, message }
      }
    });
  };

  private handleSignInModalClose = () => {
    this.setState({
      modals: {
        ...this.state.modals,
        signIn: { ...this.state.modals.signIn, isOpen: false}
      }
    });
  };

  private handleSignIn = async (user: User) => {
    console.log('[App] Sign-in successful, updating state');

    // Identify user for Sentry immediately after getting the user object
    Sentry.setUser({
      id: user.uid,
      email: user.email || undefined,
      username: user.displayName || undefined
    });

    // Update auth state
    this.setState({
      user: user,
      isAuthenticated: true
    }, async () => {
      console.log('[App] State manually updated after sign-in');

      // Load user preferences after state is updated
      try {
        await this.loadUserData(user);
        console.log('[App] User preferences loaded after sign-in');
      } catch (error) {
        console.error('[App] Error loading preferences after sign-in:', error);
        this.showNotification('Failed to load user preferences.', 'error');
      }
    });
  };

  private handleSignOut = async () => {
    console.log('[App] Starting sign out process');
    try {
      await FirebaseService.signOut();
      console.log('[App] Firebase sign out completed');

      // Clear user context in Sentry
      Sentry.setUser(null);

      // Explicitly update the auth state in React
      this.setState({
        user: null,
        isAuthenticated: false,
        marks: new Map(),
        favoriteCount: new Map(),
        seenSits: new Set()
      }, () => console.log('[App] State manually updated after sign-out'));

    } catch (error) {
      console.error('[App] Error signing out:', error);
    }
  };

  private setupRealtimeListeners = () => {
    // Clean up existing listeners if any
    if (this.firebaseListenersUnsubscribe) {
      this.firebaseListenersUnsubscribe();
    }

    // Ensure we have the timestamp before setting up
    if (!this.initialLoadTimestampMs) {
      console.warn('[App] Initial load timestamp (ms) not set, delaying listener setup.');
      return;
    }

    console.log(`[App] Setting up realtime listeners for changes after ${new Date(this.initialLoadTimestampMs).toISOString()}`);

    // Set up new listeners, passing the captured timestamp number
    this.firebaseListenersUnsubscribe = FirebaseService.setupRealtimeListeners(
      // Handle new sit added
      (sit) => {
        // Check if the sit already exists from the initial loadSits call
        if (this.state.sits.has(sit.id)) {
          console.log(`[App] Realtime: Sit ${sit.id} already exists, likely from initial load. Updating.`);
          // Treat as update instead of add if it exists
          this.setState(prevState => {
            const newSits = new Map(prevState.sits);
            newSits.set(sit.id, sit); // Update with potentially newer data
            return { sits: newSits };
          });
        } else {
          console.log('[App] Realtime: New sit added:', sit.id);
          this.setState(prevState => {
            const newSits = new Map(prevState.sits);
            newSits.set(sit.id, sit);
            return { sits: newSits };
          });
        }
      },
      // Handle sit updated
      (sit) => {
        console.log('[App] Realtime: Sit updated:', sit.id);
        // Only update if the sit exists in our current state (relevant if bounds filtering were used)
        if (this.state.sits.has(sit.id)) {
          this.setState(prevState => {
            const newSits = new Map(prevState.sits);
            newSits.set(sit.id, sit);
            return { sits: newSits };
          });
        }
      },
      // Handle sit removed
      (sitId) => {
        console.log('[App] Realtime: Sit removed:', sitId);
        // Only remove if it exists in our state
        if (this.state.sits.has(sitId)) {
          this.setState(prevState => {
            const newSits = new Map(prevState.sits);
            newSits.delete(sitId);
            return { sits: newSits };
          });
        }
      },
      // Handle marks changed
      (sitId, marks) => {
        console.log('[App] Realtime: Marks changed for sit:', sitId);
        // Only update marks if the sit is in our state
        if (this.state.sits.has(sitId)) {
          this.setState(prevState => {
            const newMarks = new Map(prevState.marks);
            newMarks.set(sitId, marks);
            return { marks: newMarks };
          });
        }
      },
      this.initialLoadTimestampMs // Pass the number here
    );
  };

  // UI methods
  private openProfileModal = () => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        profile: {
          isOpen: true
        }
      }
    }));
  };

  private closeProfileModal = () => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        profile: {
          isOpen: false
        }
      }
    }));
  };

  private openPhotoUploadModal = (state: PhotoModalState, sitId?: string, replacementImageId?: string) => {
    console.log('[App] openPhotoUploadModal called with state:', state, 'sitId:', sitId || 'null', 'replacementImageId:', replacementImageId || 'null');
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        photo: {
          isOpen: true,
          state,
          sitId,
          replacementImageId
        }
      }
    }));
  };

  private closePhotoUploadModal = () => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        photo: {
          isOpen: false,
          state: 'none'
        }
      }
    }));
  };

  private openNearbySitModal = async (sitId: string) => {
    const sit = this.state.sits.get(sitId);
    if (!sit) return;

    // Fetch images for the sit if it has an image collection
    const images = await FirebaseService.getImages(sit.imageCollectionId);
    const hasUserContributed = images.some(image => image.userId === this.state.user?.uid);

    let imageId = undefined;
    if (hasUserContributed) {
      imageId = images.find(image => image.userId === this.state.user?.uid)?.id;
      if (!imageId) {
        console.error('[App] User has contributed but no image found', this.state.user?.uid);
      }
    }

    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        nearbySit: {
          isOpen: true,
          sitId: sitId,
          hasUserContributed: hasUserContributed,
          imageId: imageId
        }
      }
    }));
  };

  private closeNearbySitModal = () => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        nearbySit: {
          isOpen: false,
          sitId: null,
          hasUserContributed: false,
          imageId: undefined
        }
      }
    }));
  };

  private openFullscreenImage = (image: Image) => {
    console.log('openFullscreenImage', image);
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        fullscreenImage: {
          isOpen: true,
          image: image
        }
      }
    }));
  };

  private closeFullscreenImage = () => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        fullscreenImage: {
          isOpen: false,
          image: null
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
      this.closeProfileModal();
    } catch (error) {
      console.error('Error saving preferences:', error);
      throw error;
    }
  };

  private handleLoadSits = async (bounds: { north: number; south: number }): Promise<number> => {
    try {
      const newSits = await FirebaseService.loadSitsFromBounds(bounds);
      const currentSits = this.state.sits;

      // Create a new map with the freshly loaded sits
      const updatedSits = new Map(newSits);

      // Preserve any temporary sits from the current state
      currentSits.forEach((sit, sitId) => {
        if (sitId.startsWith('temp_') && !updatedSits.has(sitId)) {
          updatedSits.set(sitId, sit);
        }
      });

      // Always update the state with the new combined map
      console.log(`Loaded ${newSits.size} sits from bounds. Total sits (incl. temp): ${updatedSits.size}`);
      this.setState({ sits: updatedSits });

      // Return the size of the final sits map (including temporary ones)
      return updatedSits.size;

    } catch (error) {
      console.error('Error loading nearby sits:', error);
      return this.state.sits.size; // Return current size on error to avoid incorrect notification
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
    const { user, sits, drawer } = this.state;
    if (!user) throw new Error('Must be logged in to delete images');

    const sit = sits.get(sitId);
    if (!sit) {
      throw new Error('Sit not found');
    }

    // Optimistically update UI first
    if (drawer.isOpen && drawer.sit?.id === sitId) {
      const updatedImages = drawer.images.filter(img => img.id !== imageId);

      // If this was the last image, close the drawer and remove the sit
      if (updatedImages.length === 0) {
        this.deleteSit(sitId);
        this.closeDrawerAndEraseContents();
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

    this.deleteImage(imageId, user.uid);
  };

  private deleteSit = async (sitId: string) => {
    const { sits } = this.state;
    if (!sits.has(sitId)) return;

    const updatedSits = new Map(sits);
    updatedSits.delete(sitId);

    this.setState({ sits: updatedSits });
  };

  private deleteImage = async (imageId: string, userId: string) => {
    try {
      await FirebaseService.deleteImageFromSit(imageId, userId);
    } catch (error) {
      if (error instanceof OfflineSuccess) {
        this.showNotification(error.message, 'success');
      } else {
        console.error('Error deleting image:', error);
        this.showNotification(error instanceof Error ? error.message : 'Failed to delete image', 'error');
        throw error;
      }
    }
  };

  private handleReplaceImage = (sitId: string, imageId: string) => {
    this.closeNearbySitModal();
    this.openPhotoUploadModal('replace_image', sitId, imageId);
  };

  private getImagesForSit = async (imageCollectionId: string): Promise<Image[]> => {
    try {
      return await FirebaseService.getImages(imageCollectionId);
    } catch (error) {
      console.error('Error fetching images:', error);
      throw error;
    }
  };

  private handleImageUpload = async (photoResult: PhotoResult) => {
    const { state, sitId, replacementImageId } = this.state.modals.photo;
    console.log('[App] handlePhotoUpload called with state:', state, 'sitId:', sitId || 'null', 'replacementImageId:', replacementImageId || 'null');

    try {
      // Close the photo modal immediately for better UX
      this.closePhotoUploadModal();

      // Create a new sit if we're in create_sit mode
      if (state === 'create_sit') {
        await this.createSit(photoResult);
      }
      // Add image to existing sit if we're in add_image mode
      else if (state === 'add_image' && sitId) {
        const sit = this.state.sits.get(sitId);
        if (sit) {
          await this.addImageToSit(sit, photoResult);
        }
      }
      // Replace image if we're in replace_image mode
      else if (state === 'replace_image' && sitId && replacementImageId) {
        const sit = this.state.sits.get(sitId);
        if (sit) {
          await this.replaceImage(sit, replacementImageId, photoResult);
        }
      }
    } catch (error) {
      if (error instanceof OfflineSuccess) {
        this.showNotification(error.message, 'success');
      } else {
        console.error('[App] Error creating sit:', error);
        this.showNotification('Error creating sit', 'error');
        throw error;
      }
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
      height: photoResult.dimensions.height,
      location: photoResult.location
    };

    return tempImage;
  }

  private createTemporarySit = (photoResult: PhotoResult, userId: string, userName: string) => {
    const tempSitId = `temp_${Date.now()}`;
    const imageCollectionId = `${userId}_${Date.now()}`;
    const tempSit: Sit = {
      id: tempSitId,
      location: photoResult.location,
      imageCollectionId: imageCollectionId,
      uploadedBy: userId,
      uploadedByUsername: userName,
      createdAt: new Date()
    };

    return tempSit;
  }

  private findNearbySit = async (coordinates: Location): Promise<Sit | null> => {
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

  private handleUploadToExisting = (sitId: string) => {
    this.openNearbySitModal(sitId);
  };

  private handleCreateSit = () => {
    this.openPhotoUploadModal('create_sit');
  };

  private handleAddPhotoToSit = (sitId: string) => {
    // First close the nearby sit modal
    this.closeNearbySitModal();
    // Then open the photo modal
    this.openPhotoUploadModal('add_image', sitId);
  };

  private showNotification = (
    message: string,
    type: NotificationType
  ) => {
    this.notificationsRef.current?.showNotification({ message, type });
  };

  private configureStatusBar = async () => {
    try {
      // Configure system bars (dark icons on transparent background)
      if (Capacitor.getPlatform() === 'android') {
        await EdgeToEdge.setBackgroundColor({ color: '#000000' });
        await StatusBar.setOverlaysWebView({ overlay: true });
      }
      else {
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#000000' });
      }
    } catch (e) {
      console.error('Error configuring system bars:', e);
    }
  };

  // Handle location updates from LocationService
  private handleLocationUpdate = (location?: Location) => {
    if (!location) return;

    // Check if we already had a location *before* this update
    const hadLocationBefore = !!this.state.currentLocation;

    // Update state with new location
    this.setState({ currentLocation: location }, () => {
        // Fly to location *only if* this is the FIRST valid location we've received
        // *and* the map exists *and* the drawer is closed.
        if (!hadLocationBefore && this.state.map && !this.state.drawer.isOpen) {
          this.state.map.flyTo({
            center: [location.longitude, location.latitude],
            zoom: 13, // Keep zoom consistent
            duration: 1000,
            essential: true
          });
        } else {
          console.log('[App] Location update received, not flying map.', { hadLocationBefore, hasMap: !!this.state.map, drawerOpen: this.state.drawer.isOpen });
        }
    });

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
      return;
    }

    // 1. Immediately open the drawer with the sit and an empty images array
    this.setState({
      drawer: {
        isOpen: true,
        sit,
        images: [] // Start with empty images
      }
    });

    // 2. Asynchronously fetch the actual images
    try {
        const fetchedImages = sit.imageCollectionId
            ? await this.getImagesForSit(sit.imageCollectionId)
            : [];

        // 3. Update the state *only if* the drawer is still open for the same sit
        this.setState(prevState => {
            if (prevState.drawer.isOpen && prevState.drawer.sit?.id === sit.id) {
                console.log(`[App] Fetched ${fetchedImages.length} images for sit ${sit.id}, updating drawer.`);
                return {
                    drawer: {
                        ...prevState.drawer,
                        images: fetchedImages // Update with fetched images
                    }
                };
            } else {
                // Drawer closed or changed sit before images loaded, do nothing
                console.log(`[App] Drawer closed or changed sit before images loaded for ${sit.id}.`);
                return null;
            }
        });

    } catch (error) {
        console.error(`[App] Error fetching images for sit ${sit.id} in background:`, error);
    }
  };

  private closeDrawer = () => {
    this.setState(prevState => ({
      drawer: {
        ...prevState.drawer,
        isOpen: false,
        sit: undefined,
        images: []
      }
    }));
  };

  private closeDrawerAndEraseContents = () => {
    this.setState({
      drawer: {
        isOpen: false,
        sit: undefined,
        images: []
      }
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

      this.showNotification('Finished processing pending uploads. Refresh app to see changes.', 'success');
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
      // Handle deep links on mobile
      console.log('Setting up deep link listener on mobile');
      CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
        console.log('Deep link received:', url);

        try {
          // Handle both satlas:// and https://satlas.earth URLs
          const urlObj = new URL(url);
          console.log('URL parsed:', `protocol: ${urlObj.protocol}, hostname: ${urlObj.hostname}, pathname: ${urlObj.pathname}, search: ${urlObj.search}`);

          let sitId: string | null = null;

          if (urlObj.protocol === 'satlas:') {
            // For custom scheme URLs, the hostname is actually part of the path
            // So we need to combine hostname and pathname to get the full path
            const fullPath = `/${urlObj.hostname}${urlObj.pathname}`;
            const pathSegments = fullPath.split('/').filter(Boolean);
            console.log('Custom scheme path segments:', pathSegments);
            if (pathSegments[0] === 'sit' && pathSegments[1]) {
              sitId = pathSegments[1];
            }
          } else if (urlObj.hostname === 'satlas.earth' || urlObj.hostname === 'localhost') {
            // Handle both production and development URLs
            const urlParams = new URLSearchParams(urlObj.search);
            sitId = urlParams.get('sitId');
            console.log('Web link sitId:', sitId);
          }

          if (sitId) {
            console.log('Opening sit:', sitId);
            this.openSitById(sitId);
          } else {
            console.log('No sitId found in URL');
          }
        } catch (error) {
          console.error('Error handling deep link:', error);
        }
      });

      // Log that we're ready for deep links
      console.log('Deep link listener setup complete');
    }
  }

  private async openSitById(sitId: string) {
    let sit: Sit | undefined;
    if (this.state.sits.has(sitId)) {
      sit = this.state.sits.get(sitId);
    } else {
      sit = await FirebaseService.getSit(sitId);
    }

    if (sit) {
      // If the sit was found, open its popup
      this.openPopup(sit);

      // If the map is loaded, center it on the sit
      if (this.state.map) {
        this.state.map.flyTo({
          center: [sit.location.longitude, sit.location.latitude],
          zoom: 13,
          duration: 1000,
          essential: true
        });
      }
    } else {
      this.showNotification('Sit not found', 'error');
    }
  }

  private createSit = async (photoResult: PhotoResult): Promise<Sit | null> => {
    const { user, userPreferences, sits } = this.state;
    if (!user) return null;

    try {
      // Validate that there are no nearby sits
      try {
        ValidationUtils.canUserCreateSitAtLocation(
          photoResult.location,
          user.uid,
          Array.from(sits.values())
        );
      } catch (error) {
        if (error instanceof SitTooCloseError) {

          if (!error.sitId) {
            this.showNotification('This Sit is too close to an existing one', 'error');
            return null;
          }

          const sit = sits.get(error.sitId);
          if (!sit) {
            throw new Error('Sit not found');
          }

          const existingImages = await FirebaseService.getImages(sit.imageCollectionId);

          try {
            ValidationUtils.canUserAddImageToSit(
              sit.imageCollectionId,
              user.uid,
              existingImages
            );

            // Add to existing sit
            this.addImageToSit(sit, photoResult);
            return sit;
          } catch (error) {
            this.showNotification('This Sit is too close to an existing one', 'error');
            return null;
          }
        }
        throw error; // Re-throw other validation errors
      }

      const username = userPreferences.username;
      const userId = user.uid;

      // Create a temporary sit and image
      const tempSit = this.createTemporarySit(photoResult, userId, username);
      const tempImage = this.createTemporaryImage(photoResult, tempSit.imageCollectionId, userId, username);

      // Update drawer state first
      this.setState({
        drawer: {
          isOpen: true,
          sit: tempSit,
          images: [tempImage]
        }
      }, () => {
        // After drawer is open, update sits map and fly to location
        this.setState(prevState => {
          const newSits = new Map(prevState.sits);
          newSits.set(tempSit.id, tempSit);
          return {
            sits: newSits
          };
        }, () => {
          if (this.state.map) {
            this.state.map.flyTo({
              center: [tempSit.location.longitude, tempSit.location.latitude],
              zoom: 13,
              duration: 1000,
              essential: true
            });
          }
        });
      });

      // Create sit with photo using FirebaseService in the background
      try {
        const { sit, image } = await FirebaseService.createSitWithImage(tempSit, tempImage);

        // Replace initial sit with complete sit
        this.setState(prevState => {
          const newSits = new Map(prevState.sits);
          newSits.delete(tempSit.id);
          newSits.set(sit.id, sit);

          // Update drawer if it's showing the initial sit
          if (prevState.drawer.sit?.id === tempSit.id) {
            // new images with new image
            const newImages = prevState.drawer.images.map(img => img.id === tempImage.id ? image : img);

            return {
              ...prevState,
              sits: newSits,
              modals: {
                ...prevState.modals,
                photo: {
                  ...prevState.modals.photo,
                  sitId: sit.id
                }
              },
              drawer: {
                ...prevState.drawer,
                sit,
                images: newImages
              }
            };
          }
          else {
            return {
              ...prevState,
              sits: newSits
            };
          }
        });
        return sit;
      } catch (error) {
        return tempSit
      }
    } catch (error) {
      throw error;
    }
  };

  private addImageToSit = async (sit: Sit, photoResult: PhotoResult): Promise<void> => {
    const { user, userPreferences, drawer } = this.state;
    if (!user) return;

    try {
      // Validate that the new image location is close enough to the sit
      if (!ValidationUtils.isLocationNearSit(photoResult.location, sit)) {
        this.showNotification('This image is too far from the Sit', 'error');
        return;
      }

      // Create a temporary image with a unique ID
      const tempImage = this.createTemporaryImage(
        photoResult,
        sit.imageCollectionId,
        user.uid,
        userPreferences.username
      );

      let images = drawer.images;
      if (drawer.isOpen) {
        images = [...drawer.images];
      } else {
        // TODO: this won't be optimistic if the user has closed the drawer
        images = await FirebaseService.getImages(sit.imageCollectionId)
      }
      images.push(tempImage);

      this.setState({
        drawer: {
          isOpen: true,
          sit,
          images: images
        }
      });

      // Use FirebaseService to handle the upload (including offline case)
      const uploadedImage = await FirebaseService.addImageToSit(
        tempImage,
        sit
      );

      // replace imageIds in state with the new imageId
      this.setState({
        drawer: {
          ...this.state.drawer,
          images: this.state.drawer.images.map(img => img.id === tempImage.id ? uploadedImage : img)
        }
      });

    } catch (error) {
      throw error;
    }
  };

  private replaceImage = async (sit: Sit, imageId: string, photoResult: PhotoResult): Promise<void> => {
    const { user, userPreferences, drawer } = this.state;
    if (!user) return;

    try {
      // Validate that the new image location is close enough to the sit
      if (!ValidationUtils.isLocationNearSit(photoResult.location, sit)) {
        this.showNotification('This image is too far from the Sit', 'error');
        return;
      }

      // Create a temporary image with the new data
      const tempImage = this.createTemporaryImage(
        photoResult,
        sit.imageCollectionId,
        user.uid,
        userPreferences.username
      );

      // Replace the image in the array
      const updatedImages = drawer.images.map(img =>
        img.id === imageId ? tempImage : img
      );

      // Update drawer with optimistic data
      this.setState({
        drawer: {
          isOpen: true,
          sit,
          images: updatedImages
        }
      });

      // Upload to server in the background
      const replacedImage = await FirebaseService.replaceImageInSit(
        tempImage,
        imageId,
        sit
      );

      // replace imageIds in state with the new imageId
      this.setState(prevState => {
        const newImages = prevState.drawer.images.map(img => img.id === tempImage.id ? replacedImage : img);
        return {
          drawer: {
            ...prevState.drawer,
            images: newImages
          }
        };
      });
    } catch (error) {
      throw error;
    }
  };

  // --- New Handlers ---
  private handleViewChange = (view: ViewType) => {
    // If switching back to map view, resize the map in case window resized
    if (view === 'map' && this.state.map) {
      // Use requestAnimationFrame to ensure the container is visible and has dimensions
      requestAnimationFrame(() => {
        this.state.map?.resize();
      });
    }
    this.setState({ currentView: view });
  };

  private handleSelectSitFromGallery = (sitId: string) => {
    const sit = this.state.sits.get(sitId);
    if (sit) {
      this.setState({ currentView: 'map' }, () => {
        this.openPopup(sit); // Open popup after switching view
        // Fly to the sit location on the map. Don't zoom in.
        if (this.state.map) {
          this.state.map.flyTo({
            center: [sit.location.longitude, sit.location.latitude],
            duration: 500, // Faster transition
            essential: true
          });
        }
      });
    } else {
      console.error(`[App] Sit not found for ID: ${sitId} from gallery selection.`);
      this.showNotification("Could not find the selected sit.", "error");
      this.setState({ currentView: 'map' }); // Switch back to map even if sit not found
    }
  };

  // --- Manual Location Editing Handlers ---
  private handleMissingLocationData = (
    photoData: Omit<PhotoResult, 'location'>,
    originalModalProps: { sitId?: string; replacementImageId?: string; }
  ) => {
    console.log('[App] Missing location data, opening EditLocationModal', photoData, originalModalProps);
    this.setState({
      photoForManualLocation: photoData,
      manualLocationOriginalModalProps: originalModalProps,
      showEditLocationModal: true,
      // PhotoUploadModal is assumed to close itself after calling this.
    });
  };

  private handleEditLocationModalClose = () => {
    console.log('[App] EditLocationModal closed (Cancelled)');
    this.setState({
      showEditLocationModal: false,
      photoForManualLocation: null, // Clear data
      manualLocationOriginalModalProps: null,
    });
  };

  private handleEditLocationModalConfirm = () => {
    console.log('[App] EditLocationModal confirmed, activating map editing');
    this.setState({
      showEditLocationModal: false,
      isManualLocationEditing: true, // Activate map editing mode
    });
    // photoForManualLocation and manualLocationOriginalModalProps are already set
  };

  private handleConfirmManualLocation = (selectedLocation: Location) => {
    console.log('[App] Confirming manual location', selectedLocation);
    const { photoForManualLocation, manualLocationOriginalModalProps, modals } = this.state;

    if (!photoForManualLocation) {
      console.error('[App] photoForManualLocation is null during confirm. This should not happen.');
      this.setState({ isManualLocationEditing: false, photoForManualLocation: null, manualLocationOriginalModalProps: null });
      this.showNotification('Error: Photo data missing for manual location.', 'error');
      return;
    }

    const fullPhotoResult: PhotoResult = {
      ...photoForManualLocation,
      location: selectedLocation,
    };

    // Determine the original modal state (create_sit, add_image, replace_image)
    // This relies on the modal's state when it initiated the manual location edit.
    // We stored sitId and replacementImageId in manualLocationOriginalModalProps.
    // The PhotoUploadModal's original 'state' prop ('create_sit', 'add_image', 'replace_image')
    // was implicitly captured by how handleImageUpload will be called.

    // We need to know the original 'state' of the PhotoUploadModal.
    // Let's assume handleImageUpload can correctly infer the action
    // based on sitId and replacementImageId being present or not.
    // The original `this.state.modals.photo.state` was used by `handleImageUpload`.
    // We need to ensure `handleImageUpload` can still determine the correct action.
    // The `handleImageUpload` function uses `this.state.modals.photo.state`.
    // This state will be 'none' because the modal was closed.
    // This is a PROBLEM. `handleImageUpload` needs the original context.

    // Solution: Pass the original modal state ('create_sit', 'add_image', 'replace_image')
    // through `manualLocationOriginalModalProps`.
    // This requires changing `manualLocationOriginalModalProps` structure and how it's set.
    // For now, I'll proceed assuming `handleImageUpload` can work if we just pass sitId/replacementImageId.
    // This might need refinement if `handleImageUpload` strictly depends on `modals.photo.state`.

    // Let's adjust `handleImageUpload` slightly or ensure it can work with explicit args.
    // The existing `handleImageUpload` uses `this.state.modals.photo.state`, `sitId`, `replacementImageId`.
    // Since the modal is closed, `this.state.modals.photo` might not be what we want.
    // We should pass these explicitly to a modified `handleImageUpload` or a new helper.

    // For now, let's try to call a more specific handler based on what's in manualLocationOriginalModalProps
    const { sitId, replacementImageId } = manualLocationOriginalModalProps || {};

    let operationState: PhotoModalState = 'create_sit'; // Default
    if (replacementImageId && sitId) {
        operationState = 'replace_image';
    } else if (sitId) {
        operationState = 'add_image';
    }
    // This logic mirrors how `handleImageUpload` determines the action.

    // Directly call the specific action methods instead of handleImageUpload
    if (operationState === 'create_sit') {
      this.createSit(fullPhotoResult).catch(error => {
        console.error('[App] Error creating sit after manual location:', error);
        this.showNotification('Error creating sit after manual location.', 'error');
      });
    } else if (operationState === 'add_image' && sitId) {
      const sit = this.state.sits.get(sitId);
      if (sit) {
        this.addImageToSit(sit, fullPhotoResult).catch(error => {
          console.error('[App] Error adding image to sit after manual location:', error);
          this.showNotification('Error adding image after manual location.', 'error');
        });
      } else {
        this.showNotification('Error: Original sit not found for adding image.', 'error');
      }
    } else if (operationState === 'replace_image' && sitId && replacementImageId) {
      const sit = this.state.sits.get(sitId);
      if (sit) {
        this.replaceImage(sit, replacementImageId, fullPhotoResult).catch(error => {
          console.error('[App] Error replacing image after manual location:', error);
          this.showNotification('Error replacing image after manual location.', 'error');
        });
      } else {
        this.showNotification('Error: Original sit not found for replacing image.', 'error');
      }
    }

    this.setState({ isManualLocationEditing: false, photoForManualLocation: null, manualLocationOriginalModalProps: null });
  };

  private handleCancelManualLocationEdit = () => {
    console.log('[App] Cancelling manual location edit');
    this.setState({ isManualLocationEditing: false, photoForManualLocation: null, manualLocationOriginalModalProps: null });
    // Optionally, re-open PhotoUploadModal if needed, or let user re-initiate.
    // For now, just cancelling returns them to the map.
    // The PhotoUploadModal was already closed when onStartManualLocationEdit was called.
  };
  // --- End New Handlers ---

  render() {
    const {
      user,
      isAuthenticated,

      map,
      sits,
      marks,
      favoriteCount,
      seenSits,
      currentLocation,
      modals,
      userPreferences,
      drawer,
      currentView,
      isManualLocationEditing,
      showEditLocationModal, // New state for EditLocationModal
    } = this.state;

    return (
      <div id="app" className={`app-view-${currentView}`}>
        <Notifications ref={this.notificationsRef} />

        <header id="app-header">
          <ViewToggle
            currentView={currentView}
            onViewChange={this.handleViewChange}
          />
          <AuthComponent
            user={user}
            isAuthenticated={isAuthenticated}
            userPreferences={userPreferences}
            onSignIn={this.handleSignInModalOpen}
            onToggleProfile={this.openProfileModal}
            onSavePreferences={this.handleSavePreferences}
            onUpdatePreferences={this.updatePreferences}
          />
        </header>

        <div id="map-view-content" className={currentView === 'map' ? 'active' : ''}>
          <div
            id="map-container"
            ref={this.mapContainer}
            style={{ width: '100%' }}
          />

          {!map && (
            <div className="map-loading">
              <div className="spinner large"></div>
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
              seenSits={seenSits}
              onLoadSits={this.handleLoadSits}
              onOpenPopup={this.openPopup}
              isEditingLocation={isManualLocationEditing} // Pass to MapComponent
              onConfirmLocation={this.handleConfirmManualLocation} // Pass to MapComponent
              onCancelLocationEdit={this.handleCancelManualLocationEdit} // Pass to MapComponent
            />
          )}
        </div>

        {currentView === 'gallery' && (
          <GalleryView
            sits={sits}
            onSelectSit={this.handleSelectSitFromGallery}
          />
        )}

        {/* PhotoUploadModal is only mounted when modals.photo.isOpen is true */}
        {modals.photo.isOpen && (
          <PhotoUploadModal
            isOpen={modals.photo.isOpen}
            onClose={this.closePhotoUploadModal}
            onPhotoUpload={this.handleImageUpload}
            sitId={modals.photo.sitId}
            replacementImageId={modals.photo.replacementImageId}
            showNotification={this.showNotification}
            onMissingLocationData={this.handleMissingLocationData} // Changed prop
            // onStartManualLocationEdit is removed
          />
        )}

        {showEditLocationModal && (
          <EditLocationModal
            isOpen={showEditLocationModal}
            onClose={this.handleEditLocationModalClose}
            onConfirm={this.handleEditLocationModalConfirm}
          />
        )}

        <ProfileModal
          isOpen={modals.profile.isOpen}
          user={user}
          preferences={userPreferences}
          currentLocation={currentLocation}
          version={packageJson.version}
          onClose={this.closeProfileModal}
          onSignOut={this.handleSignOut}
          onSave={this.handleSavePreferences}
          onUpdatePreferences={this.updatePreferences}
          showNotification={this.showNotification}
        />

        {currentView === 'map' && (
          <AddSitButton
            isAuthenticated={isAuthenticated}
            user={user}
            onSignIn={this.handleSignInModalOpen}
            currentLocation={currentLocation}
            findNearbySit={this.findNearbySit}
            onNearbySitFound={this.handleUploadToExisting}
            onPhotoUploadOpen={this.handleCreateSit}
            showNotification={this.showNotification}
          />
        )}

        <NearbySitModal
          isOpen={modals.nearbySit.isOpen}
          sitId={modals.nearbySit.sitId}
          hasUserContributed={modals.nearbySit.hasUserContributed}
          imageId={modals.nearbySit.imageId}
          onClose={this.closeNearbySitModal}
          onUploadToExisting={this.handleAddPhotoToSit}
          onReplaceImage={this.handleReplaceImage}
        />

        {drawer.sit && (
          <SitComponent
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
            onOpenPhotoModal={this.openPhotoUploadModal}
            onSignIn={this.handleSignInModalOpen}
            onOpenFullscreenImage={this.openFullscreenImage}
            showNotification={this.showNotification}
          />
        )}

        <FullscreenImage
          isOpen={modals.fullscreenImage.isOpen}
          image={modals.fullscreenImage.image}
          onClose={this.closeFullscreenImage}
        />

        <SignInModal
          isOpen={modals.signIn.isOpen}
          onClose={this.handleSignInModalClose}
          message={modals.signIn.message}
          showNotification={this.showNotification}
        />
      </div>
    );
  }
}

export default App;