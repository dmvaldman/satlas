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
import FullScreenCarousel from './components/FullScreenCarousel';
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
    fullScreenCarousel: {
      isOpen: boolean;
      images: Image[];
      initialIndex: number;
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
        nearbySit: { isOpen: false, data: null },
        fullScreenCarousel: {
          isOpen: false,
          images: [],
          initialIndex: 0
        }
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
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        photo: {
          isOpen: !prevState.modals.photo.isOpen,
          data: sit || null
        }
      }
    }));
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

  private handleToggleMark = async (sitId: string, markType: MarkType) => {
    const { user, marks } = this.state;
    if (!user) return;

    try {
      const currentMarks = marks.get(sitId) || new Set();
      const result = await FirebaseService.toggleMark(user.uid, sitId, markType, currentMarks);

      // Update marks
      const updatedMarks = new Map(marks);
      updatedMarks.set(sitId, result.marks);

      // Update favorite count if provided
      let updatedFavoriteCounts = this.state.favoriteCount;
      if (result.favoriteCount !== undefined) {
        updatedFavoriteCounts = new Map(updatedFavoriteCounts);
        updatedFavoriteCounts.set(sitId, result.favoriteCount);
      }

      this.setState({
        marks: updatedMarks,
        favoriteCount: updatedFavoriteCounts
      });
    } catch (error) {
      console.error('Error toggling mark:', error);
    }
  };

  private handleDeleteImage = async (sitId: string, imageId: string) => {
    const { user, sits } = this.state;
    if (!user) throw new Error('Must be logged in to delete images');

    const sit = sits.get(sitId);
    if (!sit) throw new Error('Sit not found');

    try {
      // Use FirebaseService to delete the image
      await FirebaseService.deleteImage(imageId, user.uid);

      // Check if the sit still exists in Firestore
      const sitExists = await FirebaseService.getSit(sitId);

      if (!sitExists) {
        // Sit was deleted, remove from local state
        this.setState(prevState => {
          const newSits = new Map(prevState.sits);
          newSits.delete(sitId);
          return { sits: newSits };
        });

        // Close any open popup
        if (this.mapComponentRef.current) {
          this.mapComponentRef.current.closePopup();
        }
      } else if (sit.imageCollectionId) {
        // Sit still exists, just update the images
        await this.getImagesForSit(sit.imageCollectionId);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  };

  private handleReplaceImage = (sitId: string, imageId: string) => {
    // Prepare the replacement data
    const replacementData = { sitId, imageId };

    // Open photo upload modal with replacement info
    this.setState({
      modals: {
        ...this.state.modals,
        photo: {
          isOpen: true,
          data: replacementData
        }
      }
    });
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

  // Add this new method to handle photo upload completion
  private handlePhotoUploadComplete = async (photoResult: PhotoResult, existingSit?: Sit | { sitId: string; imageId: string; }) => {
    const { user, userPreferences } = this.state;
    if (!user) return;

    const location = photoResult.location;
    if (!location) throw new Error('No location available');

    // Handle replacement data case
    if (existingSit && 'sitId' in existingSit && 'imageId' in existingSit) {
      try {
        const sitId = existingSit.sitId;
        const sit = await FirebaseService.getSit(sitId);
        if (!sit || !sit.imageCollectionId) throw new Error('Sit not found or has no image collection');

        // Now we have the full Sit object with a valid imageCollectionId
        await FirebaseService.addPhotoToSit(
          photoResult.base64Data,
          sit.imageCollectionId,
          user.uid,
          userPreferences.username
        );
        this.showNotification('Photo replaced successfully!', 'success');
        return;
      } catch (error) {
        console.error('Error replacing photo:', error);
        this.showNotification(error instanceof Error ? error.message : 'Failed to replace photo', 'error');
        return;
      }
    }

    // Handle existing Sit case
    if (existingSit && 'imageCollectionId' in existingSit) {
      // Check if the collection ID is defined
      if (!existingSit.imageCollectionId) {
        this.showNotification('Cannot add photo: no image collection found', 'error');
        return;
      }

      // Check if the new photo's location is near the existing sit
      if (getDistanceInFeet(location, existingSit.location) > 100) {
        this.showNotification('Your photo location is too far from the existing sit. Please take a photo closer to the sit location.', 'error');
        return;
      }

      try {
        await FirebaseService.addPhotoToSit(
          photoResult.base64Data,
          existingSit.imageCollectionId,
          user.uid,
          userPreferences.username
        );
        this.showNotification('Photo added successfully!', 'success');
        return;
      } catch (error) {
        console.error('Error adding photo to sit:', error);
        this.showNotification(error instanceof Error ? error.message : 'Failed to add photo', 'error');
        return;
      }
    }

    // Create a new sit if not adding to existing one
    const initialSit = FirebaseService.createInitialSit(location, user.uid);

    try {
      // Add to local state
      this.setState(prevState => ({
        sits: new Map(prevState.sits).set(initialSit.id, initialSit)
      }));

      // Create sit with photo using FirebaseService
      const sit = await FirebaseService.createSitWithPhoto(
        photoResult.base64Data,
        location,
        user.uid,
        userPreferences.username
      );

      // Replace initial sit with complete sit
      this.setState(prevState => {
        const newSits = new Map(prevState.sits);
        newSits.delete(initialSit.id);
        newSits.set(sit.id, sit);
        return { sits: newSits };
      });

      this.showNotification('New sit created successfully!', 'success');
    } catch (error) {
      if (initialSit) {  // Only try to remove if it was created
        this.setState(prevState => {
          const newSits = new Map(prevState.sits);
          newSits.delete(initialSit!.id);
          return { sits: newSits };
        });
      }
      console.error('Error creating sit:', error);
      this.showNotification('Failed to create new sit', 'error');
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

  private openFullScreenCarousel = (images: Image[], initialIndex: number) => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        fullScreenCarousel: {
          isOpen: true,
          images,
          initialIndex
        }
      }
    }));
  };

  private closeFullScreenCarousel = () => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        fullScreenCarousel: {
          ...prevState.modals.fullScreenCarousel,
          isOpen: false
        }
      }
    }));
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
    // If the same sit is already open, close the drawer
    if (this.state.drawer.isOpen && this.state.drawer.sit?.id === sit.id) {
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
    }));
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

    console.log('App render:', { isAuthenticated, user: user?.displayName });

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
            onOpenFullScreenCarousel={this.openFullScreenCarousel}
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

        {modals.fullScreenCarousel.isOpen && (
          <FullScreenCarousel
            images={modals.fullScreenCarousel.images}
            initialIndex={modals.fullScreenCarousel.initialIndex}
            onClose={this.closeFullScreenCarousel}
          />
        )}

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
            open={drawer.isOpen}
            onDismiss={this.closeDrawer}
            snapPoints={({ minHeight }) => [
              minHeight,                // Minimum height (default)
              Math.min(500, window.innerHeight * 0.6), // Medium height (60% of viewport or 500px, whichever is smaller)
              Math.min(700, window.innerHeight * 0.8)  // Maximum height (80% of viewport or 700px, whichever is smaller)
            ]}
            expandOnContentDrag
            defaultSnap={({ minHeight }) => minHeight}
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
              onImageClick={(index) => this.openFullScreenCarousel(drawer.images, index)}
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