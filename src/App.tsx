import React from 'react';
import mapboxgl from 'mapbox-gl';
import { User } from 'firebase/auth';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import AuthComponent from './Auth/AuthComponent';
import { doc, setDoc, getDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import MapComponent from './Map/MapComponent';
import { Image, Sit, Coordinates } from './types';
import { getDistanceInFeet } from './utils/geo';
import {
  ref,
  uploadString,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { storage } from './firebase';
import PhotoUploadComponent from './Photo/PhotoUpload';
import ProfileModal from './Auth/ProfileModal';
import { UserPreferences } from './types';
import { SitManager } from './Map/SitManager';
import AddSitButton from './Map/AddSitButton';
import { MarksManager } from './Map/MarksManager';
import { LocationService } from './utils/LocationService';
import NearbyExistingSitModal from './Map/NearbyExistingSitModal';

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
      data: Sit | null;
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

  userPreferences: UserPreferences;
}

type MarkType = 'favorite' | 'visited' | 'wantToGo';

interface PhotoResult {
  base64Data: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

class App extends React.Component<{}, AppState> {
  private provider: GoogleAuthProvider;
  private mapContainer: React.RefObject<HTMLDivElement>;
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
        nearbySit: { isOpen: false, data: null }
      },

      userPreferences: {
        nickname: '',
        pushNotificationsEnabled: false
      },
    };

    this.provider = new GoogleAuthProvider();
    this.mapContainer = React.createRef();
    this.locationService = new LocationService();
  }

  componentDidMount() {
    this.setupAuthListener();
    this.initializeMap();
  }

  private setupAuthListener = () => {
    auth.onAuthStateChanged(async (user) => {
      this.setState({
        user,
        isAuthenticated: !!user,
        authIsReady: true
      });

      if (user) {
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
        console.log('Map loaded');
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
      const marksMap = await MarksManager.loadUserMarks(userId);
      const favoriteCounts = await MarksManager.loadFavoriteCounts();
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
      const prefsDoc = await getDoc(doc(db, 'userPreferences', userId));
      if (prefsDoc.exists()) {
        this.setState({
          userPreferences: {
            nickname: prefsDoc.data().nickname || '',
            pushNotificationsEnabled: prefsDoc.data().pushNotificationsEnabled || false
          }
        });
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  // Auth methods
  private handleSignIn = async () => {
    try {
      await signInWithPopup(auth, this.provider);
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  private handleSignOut = async () => {
    try {
      await signOut(auth);
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
      await setDoc(doc(db, 'userPreferences', user.uid), {
        nickname: prefs.nickname,
        pushNotificationsEnabled: prefs.pushNotificationsEnabled,
        updatedAt: new Date()
      });

      this.setState({ userPreferences: prefs });
      this.toggleProfile();
    } catch (error) {
      console.error('Error saving preferences:', error);
      throw error;
    }
  };

  private handleSitClick = (sit: Sit) => {
    // This will be expanded when we implement popup functionality
    console.log('Sit clicked:', sit);
  };

  private handleLoadNearbySits = async (bounds: { north: number; south: number }) => {
    try {
      const newSits = await SitManager.loadNearbySits(bounds);

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

  private handleToggleMark = async (sitId: string, type: MarkType) => {
    const { user, marks } = this.state;
    if (!user) return;

    try {
      const currentMarks = marks.get(sitId) || new Set();
      let result;
      switch (type) {
        case 'favorite':
          result = await MarksManager.toggleFavorite(user.uid, sitId, currentMarks);
          break;
        case 'visited':
          result = await MarksManager.toggleVisited(user.uid, sitId, currentMarks);
          break;
        case 'wantToGo':
          result = await MarksManager.toggleWantToGo(user.uid, sitId, currentMarks);
          break;
      }

      // Update local state immediately for responsiveness
      this.setState(prevState => {
        const updates = {
          ...prevState,
          marks: new Map(prevState.marks).set(sitId, result.marks)
        };
        if (result.favoriteCount !== undefined) {
          updates.favoriteCount = new Map(prevState.favoriteCount).set(sitId, result.favoriteCount);
        }
        return updates;
      });
    } catch (error) {
      console.error('Error toggling mark:', error);
      this.setState(prevState => ({
        marks: new Map(prevState.marks)
      }));
      throw error;
    }
  };

  private handleDeleteImage = async (sitId: string, imageId: string) => {
    const { user, sits } = this.state;
    if (!user) throw new Error('Must be logged in to delete images');

    const sit = sits.get(sitId);
    if (!sit) throw new Error('Sit not found');

    // Check if user owns the sit
    if (sit.uploadedBy !== user.uid) {
      throw new Error('Can only delete your own images');
    }

    try {
      // Get image data first
      const imageDoc = await getDoc(doc(db, 'images', imageId));
      if (!imageDoc.exists()) throw new Error('Image not found');

      const imageData = imageDoc.data();

      // Delete from storage first
      const filename = imageData.photoURL.split('/').pop()?.split('?')[0];
      if (filename) {
        const storageRef = ref(storage, `sits/${filename}`);
        await deleteObject(storageRef);
      }

      // Then delete from Firestore
      await setDoc(doc(db, 'images', imageId), {
        deleted: true,
        deletedAt: new Date(),
        deletedBy: user.uid
      }, { merge: true });

      // Update local state
      if (sit.imageCollectionId) {
        await this.getImagesForSit(sit.imageCollectionId);
      }

    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  };

  private handleReplaceImage = (sitId: string, imageId: string) => {
    // Open photo upload modal with replace info
    this.setState({
      modals: {
        ...this.state.modals,
        photo: {
          isOpen: true,
          data: { sitId, imageId }
        }
      }
    });
  };

  private getImagesForSit = async (imageCollectionId: string): Promise<Image[]> => {
    try {
      return await SitManager.getImages(imageCollectionId);
    } catch (error) {
      console.error('Error fetching images:', error);
      throw error;
    }
  };

  // Add this new method to handle photo upload completion
  private handlePhotoUploadComplete = async (photoResult: PhotoResult, existingSit?: Sit) => {
    const { user } = this.state;
    if (!user) return;

    const location = photoResult.location;
    if (!location) throw new Error('No location available');

    if (existingSit?.imageCollectionId) {
      try {
        await SitManager.addPhotoToSit(
          photoResult.base64Data,
          existingSit.imageCollectionId,
          user.uid,
          user.displayName || 'Anonymous'
        );
        return;
      } catch (error) {
        console.error('Error adding photo to sit:', error);
        throw error;
      }
    }

    // Create a new sit if not adding to existing one
    const initialSit = SitManager.createInitialSit(location, user.uid);

    try {
      // Add to local state
      this.setState(prevState => ({
        sits: new Map(prevState.sits).set(initialSit.id, initialSit)
      }));

      // Upload photo and create actual sit
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);
      const base64WithoutPrefix = photoResult.base64Data.replace(/^data:image\/\w+;base64,/, '');

      await uploadString(storageRef, base64WithoutPrefix, 'base64');
      const photoURL = await getDownloadURL(storageRef);

      // Create image collection
      const imageCollectionId = `${Date.now()}_${user.uid}`;
      await addDoc(collection(db, 'images'), {
        photoURL,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        collectionId: imageCollectionId,
        createdAt: new Date(),
        deleted: false
      });

      // Create actual sit
      const sit = await SitManager.createSit(location, imageCollectionId, user.uid);

      // Replace initial sit with complete sit
      this.setState(prevState => {
        const newSits = new Map(prevState.sits);
        newSits.delete(initialSit.id);
        newSits.set(sit.id, sit);
        return { sits: newSits };
      });

    } catch (error) {
      if (initialSit) {  // Only try to remove if it was created
        this.setState(prevState => {
          const newSits = new Map(prevState.sits);
          newSits.delete(initialSit!.id);
          return { sits: newSits };
        });
      }
      throw error;
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

    // If not found in current sits, check database
    const sitsRef = collection(db, 'sits');
    const querySnapshot = await getDocs(sitsRef);

    for (const doc of querySnapshot.docs) {
      const sitData = doc.data();
      const sitLocation = {
        latitude: sitData.location.latitude,
        longitude: sitData.location.longitude
      };

      if (getDistanceInFeet(coordinates, sitLocation) < 100) {
        return {
          id: doc.id,
          location: sitLocation,
          imageCollectionId: sitData.imageCollectionId,
          createdAt: sitData.createdAt,
          uploadedBy: sitData.uploadedBy
        };
      }
    }

    return null;
  };

  private handleUploadToExisting = (sit: Sit) => {
    this.toggleNearbySitModal();
    this.togglePhotoUpload(sit);
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
      isMapLoading
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
            map={map}
            sits={sits}
            marks={marks}
            favoriteCount={favoriteCount}
            currentLocation={currentLocation}
            user={user}
            isLoading={isMapLoading}
            onSitClick={this.handleSitClick}
            onLoadNearbySits={this.handleLoadNearbySits}
            onToggleMark={this.handleToggleMark}
            onDeleteImage={this.handleDeleteImage}
            onReplaceImage={this.handleReplaceImage}
            getImagesForSit={this.getImagesForSit}
            onOpenPhotoModal={this.togglePhotoUpload}
            onOpenProfileModal={this.toggleProfile}
          />
        )}

        {modals.photo.isOpen && (
          <PhotoUploadComponent
            isOpen={modals.photo.isOpen}
            onClose={this.togglePhotoUpload}
            onPhotoCapture={this.handlePhotoUploadComplete}
            sit={modals.photo.data}
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
        />

        <NearbyExistingSitModal
          isOpen={modals.nearbySit.isOpen}
          sit={modals.nearbySit.data}
          onClose={this.toggleNearbySitModal}
          onUploadToExisting={this.handleUploadToExisting}
        />
      </div>
    );
  }
}

export default App;