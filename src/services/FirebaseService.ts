import { initializeApp } from 'firebase/app';
import {
  User,
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithCredential,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadString,
  deleteObject
} from 'firebase/storage';
import { generateUniqueUsername } from '../utils/userUtils';
import { Sit, Image, Coordinates, UserPreferences, MarkType, PhotoResult } from '../types';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { App } from '@capacitor/app';
import { OfflineService } from './OfflineService';

// Your web app's Firebase configuration
// This should match what's in your current firebase.ts file
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Set persistence to LOCAL (survives browser restarts)
setPersistence(auth, browserLocalPersistence);

// Firebase Service class with static methods
export class FirebaseService {
  // Export Firebase instances for direct use if needed
  static auth = auth;
  static db = db;
  static storage = storage;

  private static isResumeListenerSet = false;

  /**
   * Check if the app is online
   * @returns true if online, false if offline
   */
  static isOnline(): boolean {
    // Use the OfflineService to check network status
    return OfflineService.getInstance().isNetworkOnline();
  }

  /**
   * Handle offline photo upload by adding to queue
   * @param message The success message to show
   */
  static handleOfflinePhotoUpload(message: string = "Photo saved and will upload when you're back online"): never {
    console.log('[Firebase] Offline upload queued:', message);
    throw new Error(message);
  }

  /**
   * Handle offline error
   * @param originalError The original error that occurred
   * @param message The error message to show
   */
  static handleOfflineError(originalError: any, message: string = 'Failed to save photo for later upload'): never {
    console.error('[Firebase] Offline upload error:', originalError);
    throw new Error(message);
  }

  // Add this method to initialize app state listeners
  static initializeAppStateListeners() {
    if (Capacitor.isNativePlatform() && !this.isResumeListenerSet) {
      // Listen for app resume events
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log('[Firebase] App resumed, checking auth state');
          // Force refresh the token when app comes back to foreground
          const currentUser = auth.currentUser;
          if (currentUser) {
            currentUser.getIdToken(true)
              .then(() => console.log('[Firebase] Token refreshed on resume'))
              .catch(error => console.error('[Firebase] Error refreshing token:', error));
          }
        }
      });

      this.isResumeListenerSet = true;
    }
  }

  // ===== Authentication Methods =====

  /**
   * Sign in with Google
   * @returns Promise that resolves when sign-in is complete
   */
  static async signInWithGoogle(): Promise<void> {
    console.log('[Firebase] Starting Google sign-in process');
    try {
      if (Capacitor.isNativePlatform()) {
        console.log('[Firebase] Using native authentication');
        try {
          // Use the native plugin
          const result = await FirebaseAuthentication.signInWithGoogle();
          console.log('[Firebase] Native Google sign-in result:', JSON.stringify(result));

          // Always force a manual auth state check right after sign-in
          const currentUser = auth.currentUser;
          if (!currentUser && result.user) {
            console.log('[Firebase] Manually syncing user after sign-in');

            // Force a credential-based sign-in if we have tokens
            if (result.credential?.idToken) {
              const credential = GoogleAuthProvider.credential(
                result.credential.idToken,
                result.credential.accessToken
              );
              await signInWithCredential(auth, credential);

              // Add debug statement here
              console.log('[Firebase] Credential sign-in completed, current user:',
                auth.currentUser ? {
                  uid: (auth.currentUser as User).uid,
                  email: (auth.currentUser as User).email,
                  displayName: (auth.currentUser as User).displayName
                } : 'Still null');
            }
          }
        } catch (pluginError) {
          console.error('[Firebase] Plugin error:', JSON.stringify(pluginError));
          throw pluginError;
        }
      } else {
        console.log('[Firebase] Using web authentication');
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      }
    } catch (error) {
      console.error('[Firebase] Error signing in with Google:', error);
      throw error;
    }
  }

  /**
   * Sign out the current user
   */
  static async signOut(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut();
      } else {
        await firebaseSignOut(auth);
      }
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }

  /**
   * Set up auth state listener
   * @param callback Function to call when auth state changes
   * @returns Unsubscribe function
   */
  static onAuthStateChange(callback: (user: User | null) => void): () => void {
    if (Capacitor.isNativePlatform()) {
      // For native platforms, we need to listen to the plugin's auth state changes
      FirebaseAuthentication.addListener('authStateChange', (event) => {
        console.log('[Firebase] Auth state change from plugin:', event);

        // Add debug statement for current auth state
        const currentUser = auth.currentUser;
        console.log('[Firebase] JS SDK current user:', currentUser);

        // The callback expects a Firebase User object
        callback(auth.currentUser);
      });

      // Return a function to remove the listener
      return () => {
        FirebaseAuthentication.removeAllListeners();
      };
    } else {
      // For web, use the standard Firebase auth state change
      return onAuthStateChanged(auth, callback);
    }
  }

  // ===== User Methods =====

  /**
   * Ensure user document exists in Firestore
   * @param user Firebase user object
   */
  static async ensureUserExists(user: User): Promise<void> {
    try {
      // Check if user document exists
      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (!userDoc.exists()) {
        // Generate a unique username
        const username = await generateUniqueUsername(
          user.uid,
          user.displayName
        );

        await setDoc(doc(db, 'users', user.uid), {
          username: username,
          pushNotificationsEnabled: false,
          lastVisit: Date.now(),
          createdAt: new Date(),
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        });

        console.log(`Created new user document with username: ${username}`);
      }
    } catch (error) {
      console.error('Error ensuring user exists:', error);
      throw error;
    }
  }

  /**
   * Load user preferences from Firestore
   * @param userId User ID
   * @returns User preferences
   */
  static async loadUserPreferences(userId: string): Promise<UserPreferences> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserPreferences;

        // Validate username
        if (!userData.username || userData.username.length < 3) {
          console.error('Invalid username in user document:', userData);
          throw new Error('User document contains invalid username');
        }

        return userData;
      } else {
        // This should never happen since we create the document on auth
        console.error('User document not found for authenticated user');
        throw new Error('User document not found');
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
      throw error;
    }
  }

  /**
   * Save user preferences to Firestore
   * @param userId User ID
   * @param preferences User preferences to save
   */
  static async saveUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
    try {
      await setDoc(doc(db, 'users', userId), {
        username: preferences.username,
        pushNotificationsEnabled: preferences.pushNotificationsEnabled,
        updatedAt: new Date(),
        lastVisit: Date.now()
      }, { merge: true }); // Use merge to preserve other fields
    } catch (error) {
      console.error('Error saving preferences:', error);
      throw error;
    }
  }

  /**
   * Update username in all user's images
   * @param userId User ID
   * @param newUsername New username
   */
  static async updateUserImagesWithNewUsername(userId: string, newUsername: string): Promise<void> {
    try {
      // Query all images uploaded by this user
      const imagesRef = collection(db, 'images');
      const q = query(imagesRef, where('userId', '==', userId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return; // No images to update
      }

      // Use a batch write for efficiency
      const batch = writeBatch(db);

      // Add each image document to the batch update
      querySnapshot.forEach((imageDoc) => {
        batch.update(doc(db, 'images', imageDoc.id), {
          userName: newUsername
        });
      });

      // Commit the batch
      await batch.commit();
      console.log(`Updated userName in ${querySnapshot.size} images`);
    } catch (error) {
      console.error('Error updating images with new username:', error);
      throw error;
    }
  }

  // ===== Sit Methods =====

  /**
   * Load sits within map bounds
   * @param bounds Map bounds
   * @returns Map of sits
   */
  static async loadSits(bounds: { north: number; south: number }): Promise<Map<string, Sit>> {
    try {
      const sitsRef = collection(db, 'sits');
      const q = query(
        sitsRef,
        where('location.latitude', '>=', bounds.south),
        where('location.latitude', '<=', bounds.north)
      );

      const querySnapshot = await getDocs(q);
      const sits = new Map<string, Sit>();

      querySnapshot.docs.forEach(doc => {
        const sitData = doc.data();
        const sit: Sit = {
          id: doc.id,
          location: {
            latitude: sitData.location.latitude,
            longitude: sitData.location.longitude
          },
          imageCollectionId: sitData.imageCollectionId,
          createdAt: sitData.createdAt,
          uploadedBy: sitData.uploadedBy
        };

        sits.set(sit.id, sit);
      });

      return sits;
    } catch (error) {
      console.error('Error loading nearby sits:', error);
      throw error;
    }
  }

  /**
   * Get a single sit by ID
   * @param sitId Sit ID
   * @returns Sit object or null if not found
   */
  static async getSit(sitId: string): Promise<Sit | null> {
    try {
      const sitRef = doc(db, 'sits', sitId);
      const sitDoc = await getDoc(sitRef);
      const sitData = sitDoc.data();

      if (!sitData) return null;

      return {
        id: sitId,
        location: {
          latitude: sitData.location.latitude,
          longitude: sitData.location.longitude
        },
        imageCollectionId: sitData.imageCollectionId,
        createdAt: sitData.createdAt,
        uploadedBy: sitData.uploadedBy
      };
    } catch (error) {
      console.error('Error getting sit:', error);
      throw error;
    }
  }

  /**
   * Create initial sit object (before saving to Firebase)
   * @param coordinates Location coordinates
   * @param userId User ID
   * @returns Initial sit object
   */
  static createInitialSit(coordinates: Coordinates, userId: string): Sit {
    return {
      id: `new_${Date.now()}`,
      location: coordinates,
      uploadedBy: userId
    };
  }

  /**
   * Create a sit in Firestore
   * @param coordinates Location coordinates
   * @param imageCollectionId Image collection ID
   * @param userId User ID
   * @returns Created sit
   */
  static async createSit(coordinates: Coordinates, imageCollectionId: string, userId: string): Promise<Sit> {
    try {
      const sitRef = doc(collection(db, 'sits'));
      const sitData = {
        location: coordinates,
        imageCollectionId,
        createdAt: new Date(),
        uploadedBy: userId
      };

      await setDoc(sitRef, sitData);

      return {
        id: sitRef.id,
        ...sitData
      };
    } catch (error) {
      console.error('Error creating sit:', error);
      throw error;
    }
  }

  /**
   * Create a sit with a photo
   * @param photoResult The photo result containing base64 data and location
   * @param userId The user ID
   * @param userName The user's display name
   * @returns Promise resolving to the created sit
   * @throws Error when offline
   */
  static async createSitWithPhoto(
    photoResult: PhotoResult,
    userId: string,
    userName: string
  ): Promise<Sit> {
    // Check if we're online
    if (!this.isOnline()) {
      try {
        console.log('[Firebase] Offline, adding to pending uploads queue');

        // Add to pending uploads
        await OfflineService.getInstance().addPendingNewSit(
          photoResult,
          userId,
          userName
        );

        // Throw a success error to indicate offline handling
        throw this.handleOfflinePhotoUpload();
      } catch (error: any) {
        // If this is already our offline success error, just rethrow
        if (error instanceof Error && error.message === "Photo saved and will upload when you're back online") {
          throw error;
        }

        // Otherwise, it's a real error from the queue operation
        throw this.handleOfflineError(error);
      }
    }

    try {
      // We're online, proceed with upload
      console.log('[Firebase] Online, uploading photo and creating sit');

      // Upload photo
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);

      // Detect content type from base64 data
      let contentType = 'image/jpeg'; // Default
      if (photoResult.base64Data.startsWith('data:')) {
        const matches = photoResult.base64Data.match(/^data:([A-Za-z-+/]+);base64,/);
        if (matches && matches.length > 1) {
          contentType = matches[1];
        }
      }

      const base64WithoutPrefix = photoResult.base64Data.replace(/^data:image\/\w+;base64,/, '');

      // Add metadata with detected content type
      const metadata = {
        contentType: contentType
      };

      // Upload with metadata
      await uploadString(storageRef, base64WithoutPrefix, 'base64', metadata);

      // Use CDN URL
      const photoURL = `https://satlas-world.web.app/images/sits/${filename}`;

      // Create image collection
      const imageCollectionId = `${Date.now()}_${userId}`;
      await addDoc(collection(db, 'images'), {
        photoURL,
        userId,
        userName,
        collectionId: imageCollectionId,
        createdAt: new Date(),
        width: photoResult.dimensions.width,
        height: photoResult.dimensions.height
      });

      // Create the sit
      return await this.createSit(photoResult.location, imageCollectionId, userId);
    } catch (error: any) {
      console.error('Error creating sit with photo:', error);

      // Check if this is a network-related error
      if (!navigator.onLine || error.message?.includes('network')) {
        console.log('[Firebase] Network error detected, falling back to offline mode');

        try {
          // Add to pending uploads
          await OfflineService.getInstance().addPendingNewSit(
            photoResult,
            userId,
            userName
          );

          // Throw a success error with custom message
          throw this.handleOfflinePhotoUpload("Network error occurred, but photo was saved for later upload");
        } catch (queueError: any) {
          // Only throw a new error if it's not already our offline error
          if (!(queueError instanceof Error && queueError.message === "Photo saved and will upload when you're back online")) {
            throw this.handleOfflineError(queueError);
          }
          throw queueError;
        }
      }

      // For other errors, just rethrow
      throw error;
    }
  }

  /**
   * Add a photo to an existing sit
   * @param photoResult The photo result containing base64 data
   * @param imageCollectionId The image collection ID
   * @param userId The user ID
   * @param userName The user's display name
   * @returns Promise resolving to the created image
   * @throws Error when offline
   */
  static async addPhotoToSit(
    photoResult: PhotoResult,
    imageCollectionId: string,
    userId: string,
    userName: string
  ): Promise<Image> {
    // Check if we're online
    if (!this.isOnline()) {
      try {
        console.log('[Firebase] Offline, adding to pending uploads queue');

        // Add to pending uploads
        await OfflineService.getInstance().addPendingPhotoToSit(
          photoResult,
          imageCollectionId,
          userId,
          userName
        );

        // Throw a success error to indicate offline handling
        throw this.handleOfflinePhotoUpload();
      } catch (error: any) {
        // If this is already our offline success error, just rethrow
        if (error instanceof Error && error.message === "Photo saved and will upload when you're back online") {
          throw error;
        }

        // Otherwise, it's a real error from the queue operation
        throw this.handleOfflineError(error);
      }
    }

    try {
      // We're online, proceed with upload
      console.log('[Firebase] Online, uploading photo to existing sit');

      // Upload photo
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);

      // Detect content type from base64 data
      let contentType = 'image/jpeg'; // Default
      if (photoResult.base64Data.startsWith('data:')) {
        const matches = photoResult.base64Data.match(/^data:([A-Za-z-+/]+);base64,/);
        if (matches && matches.length > 1) {
          contentType = matches[1];
        }
      }

      const base64WithoutPrefix = photoResult.base64Data.replace(/^data:image\/\w+;base64,/, '');

      // Add metadata with detected content type
      const metadata = {
        contentType: contentType
      };

      // Upload with metadata
      await uploadString(storageRef, base64WithoutPrefix, 'base64', metadata);

      // Use CDN URL
      const photoURL = `https://satlas-world.web.app/images/sits/${filename}`;

      // Create image document in Firestore
      const imageDoc = await addDoc(collection(db, 'images'), {
        photoURL,
        userId,
        userName,
        collectionId: imageCollectionId,
        createdAt: new Date(),
        width: photoResult.dimensions.width,
        height: photoResult.dimensions.height
      });

      return {
        id: imageDoc.id,
        photoURL,
        userId,
        userName,
        collectionId: imageCollectionId,
        createdAt: new Date(),
        width: photoResult.dimensions.width,
        height: photoResult.dimensions.height
      };
    } catch (error: any) {
      console.error('Error adding photo to sit:', error);

      // Check if this is a network-related error
      if (!navigator.onLine || error.message?.includes('network')) {
        console.log('[Firebase] Network error detected, falling back to offline mode');

        try {
          // Add to pending uploads
          await OfflineService.getInstance().addPendingPhotoToSit(
            photoResult,
            imageCollectionId,
            userId,
            userName
          );

          // Throw a success error with custom message
          throw this.handleOfflinePhotoUpload("Network error occurred, but photo was saved for later upload");
        } catch (queueError: any) {
          // Only throw a new error if it's not already our offline error
          if (!(queueError instanceof Error && queueError.message === "Photo saved and will upload when you're back online")) {
            throw this.handleOfflineError(queueError);
          }
          throw queueError;
        }
      }

      // For other errors, just rethrow
      throw error;
    }
  }

  /**
   * Delete a sit
   * @param sitId Sit ID
   * @param userId User ID
   * @returns Whether deletion was successful
   */
  static async deleteSit(sitId: string, userId: string): Promise<boolean> {
    try {
      // Get the sit first to verify ownership
      const sitRef = doc(db, 'sits', sitId);
      const sitDoc = await getDoc(sitRef);

      if (!sitDoc.exists()) {
        console.log(`Sit ${sitId} not found`);
        return false;
      }

      const sitData = sitDoc.data();

      // Verify ownership
      if (sitData.uploadedBy !== userId) {
        console.log(`User ${userId} is not the owner of sit ${sitId}, not deleting`);
        return false;
      }

      // Delete the sit
      await deleteDoc(sitRef);
      console.log(`Deleted sit ${sitId}`);
      return true;
    } catch (error) {
      console.error('Error deleting sit:', error);
      throw error;
    }
  }

  /**
   * Delete an image
   * @param imageId Image ID
   * @param userId User ID
   */
  static async deleteImage(imageId: string, userId: string): Promise<void> {
    try {
      // Get image data first
      const imageDoc = await getDoc(doc(db, 'images', imageId));
      if (!imageDoc.exists()) throw new Error('Image not found');

      const imageData = imageDoc.data();

      // Verify ownership
      if (imageData.userId !== userId) {
        throw new Error('Can only delete your own images');
      }

      // Get the collection ID for this image
      const collectionId = imageData.collectionId;
      if (!collectionId) {
        throw new Error('Image is not associated with a collection');
      }

      // Delete from storage first
      const filename = imageData.photoURL.split('/').pop()?.split('?')[0];
      if (filename) {
        const storageRef = ref(storage, `sits/${filename}`);
        try {
          await deleteObject(storageRef);
          console.log(`Deleted original image: ${filename}`);
          // The Cloud Function will handle deleting variations
        } catch (error) {
          console.error('Error deleting image file:', error);
        }
      }

      // Delete the image document from Firestore
      const imageRef = doc(db, 'images', imageId);
      await deleteDoc(imageRef);
      console.log(`Deleted image document: ${imageId}`);

      // Check if this was the last image in the collection
      const imagesRef = collection(db, 'images');
      const q = query(
        imagesRef,
        where('collectionId', '==', collectionId)
      );

      const remainingImages = await getDocs(q);

      // If no images remain, find and delete the sit
      if (remainingImages.empty) {
        console.log('No images remain in collection, deleting sit');

        // Find the sit with this collection ID
        const sitsRef = collection(db, 'sits');
        const sitQuery = query(sitsRef, where('imageCollectionId', '==', collectionId));
        const sitSnapshot = await getDocs(sitQuery);

        if (!sitSnapshot.empty) {
          // There should be only one sit with this collection ID
          const sitDoc = sitSnapshot.docs[0];
          const sitId = sitDoc.id;

          // Use the deleteSit method to handle the deletion
          await this.deleteSit(sitId, userId);
        }
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  }

  /**
   * Get images for a sit
   * @param collectionId Collection ID
   * @returns Array of images
   */
  static async getImages(collectionId: string): Promise<Image[]> {
    try {
      console.log('Fetching images for collection:', collectionId);

      const imagesRef = collection(db, 'images');
      const q = query(
        imagesRef,
        where('collectionId', '==', collectionId)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        photoURL: doc.data().photoURL || '',
        userId: doc.data().userId,
        userName: doc.data().userName,
        collectionId: doc.data().collectionId,
        createdAt: doc.data().createdAt.toDate(),
        width: doc.data().width || undefined,
        height: doc.data().height || undefined
      }));
    } catch (error) {
      console.error('Error getting images:', error);
      throw error;
    }
  }

  // ===== Marks Methods =====

  /**
   * Load favorite counts for sits
   * @returns Map of sit IDs to favorite counts
   */
  static async loadFavoriteCounts(): Promise<Map<string, number>> {
    try {
      const marksQuery = query(collection(db, 'favorites'));
      const querySnapshot = await getDocs(marksQuery);

      // Count favorites per sitId
      const countMap = new Map<string, number>();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.sitId) {
          countMap.set(data.sitId, (countMap.get(data.sitId) || 0) + 1);
        }
      });

      return countMap;
    } catch (error) {
      console.error('Error loading favorite counts:', error);
      throw error;
    }
  }

  /**
   * Load user marks (favorites, visited, want to go)
   * @param userId User ID
   * @returns Map of sit IDs to sets of mark types
   */
  static async loadUserMarks(userId: string): Promise<Map<string, Set<MarkType>>> {
    try {
      // Query each collection separately
      const favoritesQuery = query(collection(db, 'favorites'), where('userId', '==', userId));
      const visitedQuery = query(collection(db, 'visited'), where('userId', '==', userId));
      const wantToGoQuery = query(collection(db, 'wantToGo'), where('userId', '==', userId));

      const [favoritesSnapshot, visitedSnapshot, wantToGoSnapshot] = await Promise.all([
        getDocs(favoritesQuery),
        getDocs(visitedQuery),
        getDocs(wantToGoQuery)
      ]);

      const marksMap = new Map<string, Set<MarkType>>();

      // Process favorites
      favoritesSnapshot.forEach(doc => {
        const sitId = doc.data().sitId;
        const marks = marksMap.get(sitId) || new Set<MarkType>();
        marks.add('favorite');
        marksMap.set(sitId, marks);
      });

      // Process visited
      visitedSnapshot.forEach(doc => {
        const sitId = doc.data().sitId;
        const marks = marksMap.get(sitId) || new Set<MarkType>();
        marks.add('visited');
        marksMap.set(sitId, marks);
      });

      // Process want to go
      wantToGoSnapshot.forEach(doc => {
        const sitId = doc.data().sitId;
        const marks = marksMap.get(sitId) || new Set<MarkType>();
        marks.add('wantToGo');
        marksMap.set(sitId, marks);
      });

      return marksMap;
    } catch (error) {
      console.error('Error loading user marks:', error);
      throw error;
    }
  }

  /**
   * Toggle a mark (favorite, visited, want to go)
   * @param userId User ID
   * @param sitId Sit ID
   * @param markType Mark type
   * @returns Updated marks and favorite count
   */
  static async toggleMark(
    userId: string,
    sitId: string,
    markType: MarkType
  ): Promise<void> {
    try {
      // Document references for all mark types
      const favoriteRef = doc(db, 'favorites', `${userId}_${sitId}`);
      const visitedRef = doc(db, 'visited', `${userId}_${sitId}`);
      const wantToGoRef = doc(db, 'wantToGo', `${userId}_${sitId}`);

      // Check if the mark already exists
      const docRef = markType === 'favorite'
        ? favoriteRef
        : markType === 'visited'
          ? visitedRef
          : wantToGoRef;

      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // If the mark exists, remove it
        await deleteDoc(docRef);
      } else {
        // Clear all existing marks first
        await Promise.all([
          deleteDoc(favoriteRef),
          deleteDoc(visitedRef),
          deleteDoc(wantToGoRef)
        ]);

        // Add the new mark
        await setDoc(docRef, {
          userId,
          sitId,
          createdAt: new Date()
        });
      }
    } catch (error) {
      console.error(`Error toggling ${markType}:`, error);
      throw error;
    }
  }

  /**
   * Replace an existing image
   * @param photoResult The photo result containing base64 data
   * @param imageCollectionId The image collection ID
   * @param imageId The image ID to replace
   * @param userId The user ID
   * @param userName The user's display name
   * @throws Error when offline
   */
  static async replaceImage(
    photoResult: PhotoResult,
    imageCollectionId: string,
    imageId: string,
    userId: string,
    userName: string
  ): Promise<void> {
    // Check if we're online
    if (!this.isOnline()) {
      try {
        console.log('[Firebase] Offline, adding to pending uploads queue');

        // Add to pending uploads
        await OfflineService.getInstance().addPendingReplaceImage(
          photoResult,
          imageCollectionId,
          imageId,
          userId,
          userName
        );

        // Throw a success error to indicate offline handling
        throw this.handleOfflinePhotoUpload();
      } catch (error: any) {
        // If this is already our offline success error, just rethrow
        if (error instanceof Error && error.message === "Photo saved and will upload when you're back online") {
          throw error;
        }

        // Otherwise, it's a real error from the queue operation
        throw this.handleOfflineError(error);
      }
    }

    try {
      // We're online, proceed with upload
      console.log('[Firebase] Online, replacing image');

      // Delete the old image first
      await this.deleteImage(imageId, userId);

      // Then add a new photo
      await this.addPhotoToSit(
        photoResult,
        imageCollectionId,
        userId,
        userName
      );

    } catch (error: any) {
      console.error('Error replacing image:', error);

      // Check if this is a network-related error
      if (!navigator.onLine || error.message?.includes('network')) {
        console.log('[Firebase] Network error detected, falling back to offline mode');

        try {
          // Add to pending uploads
          await OfflineService.getInstance().addPendingReplaceImage(
            photoResult,
            imageCollectionId,
            imageId,
            userId,
            userName
          );

          // Throw a success error with custom message
          throw this.handleOfflinePhotoUpload("Network error occurred, but image replacement was saved for later");
        } catch (queueError: any) {
          // Only throw a new error if it's not already our offline error
          if (!(queueError instanceof Error && queueError.message === "Photo saved and will upload when you're back online")) {
            throw this.handleOfflineError(queueError);
          }
          throw queueError;
        }
      }

      // For other errors, just rethrow
      throw error;
    }
  }

  /**
   * Process all pending uploads from the OfflineService
   * @returns Promise that resolves when all uploads are processed
   */
  static async processPendingUploads(): Promise<void> {
    try {
      console.log('[Firebase] Processing pending uploads');
      const offlineService = OfflineService.getInstance();

      // Check if we're online
      if (!this.isOnline()) {
        console.log('[Firebase] Cannot process uploads while offline');
        return;
      }

      // Process new sits
      const pendingNewSits = offlineService.getPendingNewSits();
      for (const upload of pendingNewSits) {
        try {
          await this.createSitWithPhoto(
            upload.photoResult,
            upload.userId,
            upload.userName
          );
          // Remove from queue on success
          await offlineService.removePendingUpload(upload.id);
        } catch (error) {
          console.error('[Firebase] Error processing new sit upload:', error);
          // Continue with next upload
        }
      }

      // Process add to existing sits
      const pendingAddToSits = offlineService.getPendingAddToSits();
      for (const upload of pendingAddToSits) {
        try {
          await this.addPhotoToSit(
            upload.photoResult,
            upload.imageCollectionId,
            upload.userId,
            upload.userName
          );
          // Remove from queue on success
          await offlineService.removePendingUpload(upload.id);
        } catch (error) {
          console.error('[Firebase] Error processing add to sit upload:', error);
          // Continue with next upload
        }
      }

      // Process replace images
      const pendingReplaceImages = offlineService.getPendingReplaceImages();
      for (const upload of pendingReplaceImages) {
        try {
          await this.replaceImage(
            upload.photoResult,
            upload.imageCollectionId,
            upload.imageId,
            upload.userId,
            upload.userName
          );
          // Remove from queue on success
          await offlineService.removePendingUpload(upload.id);
        } catch (error) {
          console.error('[Firebase] Error processing replace image upload:', error);
          // Continue with next upload
        }
      }

      console.log('[Firebase] Finished processing pending uploads');
    } catch (error) {
      console.error('[Firebase] Error in processPendingUploads:', error);
      throw error;
    }
  }
}

// Export auth for direct access (moved outside the class)
export { auth };