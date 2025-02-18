import React from 'react';
import mapboxgl from 'mapbox-gl';
import { User } from 'firebase/auth';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import AuthComponent from './Auth/AuthComponent';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import MapComponent from './Map/MapComponent';
import { Image } from './types';
import {
  ref,
  uploadString,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { storage } from './firebase';
import PhotoUploadComponent from './Photo/PhotoUpload';

interface AppState {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  authIsReady: boolean;

  // Map state
  map: mapboxgl.Map | null;
  currentLocation: { latitude: number; longitude: number } | null;
  isMapLoading: boolean;

  // UI state
  isProfileOpen: boolean;
  isPhotoUploadOpen: boolean;

  // Data state
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;

  // Modal state
  modals: {
    photo: {
      isOpen: boolean;
      data?: { sitId?: string; imageId?: string };
    };
    profile: {
      isOpen: boolean;
      data?: any;
    };
  };
}

interface Sit {
  id: string;
  imageCollectionId: string;
  // ... other sit properties
}

type MarkType = 'favorite' | 'visited' | 'wantToGo';

class App extends React.Component<{}, AppState> {
  private provider: GoogleAuthProvider;

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

      // UI state
      isProfileOpen: false,
      isPhotoUploadOpen: false,

      // Data state
      sits: new Map(),
      marks: new Map(),
      favoriteCount: new Map(),

      // Modal state
      modals: {
        photo: { isOpen: false },
        profile: { isOpen: false }
      }
    };

    this.provider = new GoogleAuthProvider();
  }

  componentDidMount() {
    // Handle auth state changes
    this.setupAuthListener();
    // Initialize map
    this.initializeMap();
  }

  private setupAuthListener = () => {
    auth.onAuthStateChanged((user) => {
      this.setState({
        user,
        isAuthenticated: !!user,
        authIsReady: true
      });

      if (user) {
        this.loadUserData(user.uid);
      }
    });
  };

  private async initializeMap() {
    try {
      const coordinates = await this.getCurrentLocation();
      const map = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 13
      });

      map.on('load', () => {
        this.setState({ isMapLoading: false });
        window.dispatchEvent(new CustomEvent('mapReady'));
      });

      this.setState({ map, currentLocation: coordinates });
    } catch (error) {
      console.error('Error initializing map:', error);
      // Initialize with default location
      const defaultLocation = { latitude: 0, longitude: 0 };
      const map = new mapboxgl.Map({
        container: 'map-container',
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

  private getCurrentLocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          reject(error);
        }
      );
    });
  };

  private async loadUserData(userId: string) {
    // Load user's sits, marks, etc.
    // This will be implemented as we migrate other components
  }

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
      isProfileOpen: !prevState.isProfileOpen
    }));
  };

  private togglePhotoUpload = () => {
    this.setState(prevState => ({
      isPhotoUploadOpen: !prevState.isPhotoUploadOpen
    }));
  };

  private handleSavePreferences = async (prefs: UserPreferences) => {
    if (!this.state.user) return;

    try {
      await setDoc(doc(db, 'users', this.state.user.uid), {
        ...prefs,
        lastVisit: new Date().getTime()
      }, { merge: true });
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
    // Implementation of loading nearby sits from Firebase
    // This will be expanded when we implement the sits functionality
    try {
      // Fetch sits within bounds
      // Update this.state.sits
    } catch (error) {
      console.error('Error loading nearby sits:', error);
    }
  };

  private handleToggleMark = async (sitId: string, type: MarkType) => {
    const { user, marks } = this.state;
    if (!user) return;

    try {
      const sitMarks = marks.get(sitId) || new Set();
      const newMarks = new Set(sitMarks);

      if (newMarks.has(type)) {
        newMarks.delete(type);
      } else {
        newMarks.add(type);
      }

      // Update local state immediately for responsiveness
      this.setState(prevState => ({
        marks: new Map(prevState.marks).set(sitId, newMarks)
      }));

      // Update Firestore
      await setDoc(doc(db, 'marks', `${user.uid}_${sitId}`), {
        userId: user.uid,
        sitId,
        types: Array.from(newMarks),
        updatedAt: new Date()
      });

      // Update favorite count if necessary
      if (type === 'favorite') {
        const currentCount = this.state.favoriteCount.get(sitId) || 0;
        const newCount = newMarks.has('favorite') ? currentCount + 1 : currentCount - 1;

        this.setState(prevState => ({
          favoriteCount: new Map(prevState.favoriteCount).set(sitId, newCount)
        }));
      }

    } catch (error) {
      // Revert local state on error
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
      await this.getImagesForSit(sit.imageCollectionId);

    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  };

  private handleReplaceImage = (sitId: string, imageId: string) => {
    // Open photo upload modal with replace info
    this.setState({
      isPhotoUploadOpen: true,
      photoUploadReplaceInfo: { sitId, imageId }
    });
  };

  private getImagesForSit = async (imageCollectionId: string): Promise<Image[]> => {
    try {
      const imagesQuery = query(
        collection(db, 'images'),
        where('collectionId', '==', imageCollectionId),
        where('deleted', '==', false)
      );

      const snapshot = await getDocs(imagesQuery);
      const images = snapshot.docs.map(doc => ({
        id: doc.id,
        photoURL: doc.data().photoURL,
        userId: doc.data().userId,
        userName: doc.data().userName,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      }));

      // Sort by creation date
      images.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Update local state cache
      this.setState(prevState => ({
        imagesByCollection: new Map(prevState.imagesByCollection).set(
          imageCollectionId,
          images
        )
      }));

      return images;

    } catch (error) {
      console.error('Error fetching images:', error);
      throw error;
    }
  };

  // Add this new method to handle photo upload completion
  private handlePhotoUploadComplete = async (
    imageBase64: string,
    sitId?: string,
    replaceImageId?: string
  ) => {
    const { user } = this.state;
    if (!user) throw new Error('Must be logged in to upload images');

    try {
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);

      // Remove data URL prefix
      const base64WithoutPrefix = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      // Upload to storage
      await uploadString(storageRef, base64WithoutPrefix, 'base64');
      const photoURL = await getDownloadURL(storageRef);

      if (replaceImageId) {
        // Handle image replacement
        await setDoc(doc(db, 'images', replaceImageId), {
          photoURL,
          updatedAt: new Date()
        }, { merge: true });
      } else if (sitId) {
        // Handle adding new image to existing sit
        const sit = this.state.sits.get(sitId);
        if (!sit) throw new Error('Sit not found');

        const newImageRef = doc(collection(db, 'images'));
        await setDoc(newImageRef, {
          photoURL,
          userId: user.uid,
          userName: user.displayName || 'Anonymous',
          collectionId: sit.imageCollectionId,
          createdAt: new Date(),
          deleted: false
        });
      }

      // Close upload modal
      this.setState({
        isPhotoUploadOpen: false,
        photoUploadReplaceInfo: null
      });

    } catch (error) {
      console.error('Error uploading photo:', error);
      throw error;
    }
  };

  private handleModalOpen = (type: 'photo' | 'profile', data?: any) => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        [type]: { isOpen: true, data }
      }
    }));
  };

  private handleModalClose = (type: 'photo' | 'profile') => {
    this.setState(prevState => ({
      modals: {
        ...prevState.modals,
        [type]: { isOpen: false }
      }
    }));
  };

  render() {
    const {
      user,
      isAuthenticated,
      isProfileOpen,
      isMapLoading,
      map,
      sits,
      marks,
      favoriteCount,
      currentLocation,
      modals
    } = this.state;

    return (
      <div className="app">
        <header>
          <AuthComponent
            user={user}
            isAuthenticated={isAuthenticated}
            onSignIn={this.handleSignIn}
            onSignOut={this.handleSignOut}
            isProfileOpen={isProfileOpen}
            onToggleProfile={this.toggleProfile}
            onSavePreferences={this.handleSavePreferences}
          />
        </header>

        <MapComponent
          map={map}
          sits={sits}
          marks={marks}
          favoriteCount={favoriteCount}
          currentLocation={currentLocation}
          isLoading={isMapLoading}
          userId={user?.uid || null}
          onSitClick={this.handleSitClick}
          onLoadNearbySits={this.handleLoadNearbySits}
          onToggleMark={this.handleToggleMark}
          onDeleteImage={this.handleDeleteImage}
          onReplaceImage={this.handleReplaceImage}
          getImagesForSit={this.getImagesForSit}
          onModalOpen={this.handleModalOpen}
        />

        <PhotoUploadComponent
          isOpen={modals.photo.isOpen}
          replaceInfo={modals.photo.data}
          onClose={() => this.handleModalClose('photo')}
          onPhotoCapture={this.handlePhotoUploadComplete}
        />

        {/* Other components will be added as we migrate them */}
      </div>
    );
  }
}

export default App;