import React from 'react';
import mapboxgl from 'mapbox-gl';
import { User } from 'firebase/auth';
import AuthComponent from './Auth/AuthComponent';
import MapComponent from './Map/MapComponent';
import { Image, Sit, Coordinates, MarkType } from './types';
import { getDistanceInFeet } from './utils/geo';
import PhotoUploadComponent from './Photo/PhotoUpload';
import ProfileModal from './Auth/ProfileModal';
import { UserPreferences } from './types';
import AddSitButton from './Map/AddSitButton';
import NearbyExistingSitModal from './Map/NearbyExistingSitModal';
import FullScreenCarousel from './Map/FullScreenCarousel';
import { FirebaseService } from './services/FirebaseService';
import { LocationService } from './utils/LocationService';

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
    };

    this.locationService = new LocationService();
  }

  componentDidMount() {
    this.setupAuthListener();
    this.initializeMap();
  }

  private setupAuthListener = () => {
    FirebaseService.onAuthStateChange(async (user) => {
      this.setState({
        user,
        isAuthenticated: !!user,
        authIsReady: true
      });

      if (user) {
        // Check if user document exists, create if not
        await FirebaseService.ensureUserExists(user);

        await Promise.all([
          this.loadUserData(user.uid),
          this.loadUserPreferences(user.uid)
        ]);
      }
    });
  };

  private initializeMap = async () => {
    try {
      if (!this.mapContainer.current) {
        throw new Error('Map container not found');
      }

      const coordinates = await this.locationService.getCurrentLocation();

      const map = new mapboxgl.Map({
        container: this.mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 13
      });

      // Add geolocate control
      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        trackUserLocation: true,
        showUserHeading: false
      });

      map.addControl(geolocate);

      map.on('load', () => {
        // Trigger geolocation on map load
        geolocate.trigger();
        this.setState({ isMapLoading: false });
        window.dispatchEvent(new CustomEvent('mapReady'));
      });

      this.setState({ map, currentLocation: coordinates });

    } catch (error) {
      console.error('Error initializing map:', error);
      // If we can't get location, center on San Francisco as default
      const defaultLocation = { latitude: 37.7749, longitude: -122.4194 };

      if (this.mapContainer.current) {
        const map = new mapboxgl.Map({
          container: this.mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [defaultLocation.longitude, defaultLocation.latitude],
          zoom: 13
        });

        this.setState({
          map,
          currentLocation: defaultLocation,
          isMapLoading: false
        });
      }
    }
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

  private loadUserPreferences = async (userId: string) => {
    try {
      const userData = await FirebaseService.loadUserPreferences(userId);
      this.setState({ userPreferences: userData });
    } catch (error) {
      console.error('Error loading user preferences:', error);
      // Don't set state with invalid data
    }
  };

  // Auth methods
  private handleSignIn = async () => {
    try {
      await FirebaseService.signInWithGoogle();
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  private handleSignOut = async () => {
    try {
      await FirebaseService.signOut();
      this.setState({
        marks: new Map(),
        favoriteCount: new Map()
      });
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // UI methods
  private toggleProfile = () => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        profile: {
          isOpen: !prevState.modals.profile.isOpen,
          data: prevState.modals.profile.data
        }
      }
    }));
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
        this.setState({ notification: null });
      }, 3000);
    });
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
      notification
    } = this.state;

    // Still show loading, but include the map container
    if (!authIsReady) {
      return (
        <div className="app">
          <div className="loading">Loading...</div>
          <div
            id="map-container"
            ref={this.mapContainer}
            style={{ width: '100%', height: 'calc(100vh - 60px)' }}
          />
        </div>
      );
    }

    return (
      <div className="app">
        <header>
          <AuthComponent
            user={user}
            isAuthenticated={isAuthenticated}
            userPreferences={userPreferences}
            onSignIn={this.handleSignIn}
            onSignOut={this.handleSignOut}
            isProfileOpen={modals.profile.isOpen}
            onToggleProfile={this.toggleProfile}
            onSavePreferences={this.handleSavePreferences}
          />
        </header>

        <div
          id="map-container"
          ref={this.mapContainer}
          style={{ width: '100%', height: 'calc(100vh - 60px)' }}
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
            {notification.message}
          </div>
        )}
      </div>
    );
  }
}

export default App;