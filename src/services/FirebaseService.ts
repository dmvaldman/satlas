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
  OAuthProvider,
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
import { Sit, Image, Location, UserPreferences, MarkType, PhotoResult, PushToken } from '../types';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { OfflineService } from './OfflineService';
import { ValidationUtils } from '../utils/ValidationUtils';

// Conditionally import Apple Sign In plugin only for iOS
let SignInWithApple: any;
if (Capacitor.getPlatform() === 'ios') {
  const appleSignInModule = require('@capacitor-community/apple-sign-in');
  SignInWithApple = appleSignInModule.SignInWithApple;
}

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
          // First ensure we're signed out
          await FirebaseService.signOut();

          // Use the native plugin
          const result = await FirebaseAuthentication.signInWithGoogle({
            mode: 'popup'  // Force popup mode which works better on emulators
          });
          console.log('[Firebase] Native Google sign-in raw result:', result);

          if (!result) {
            console.error('[Firebase] No result from native sign-in');
            throw new Error('No result from native sign-in');
          }

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
            } else {
              console.error('[Firebase] No credentials in result:', result);
              throw new Error('No credentials available');
            }
          }
        } catch (error: unknown) {
          console.error('[Firebase] Plugin error:', error);
          // If we get a specific error about credentials, try web fallback
          if (error instanceof Error &&
              (error.message.includes('credentials') || error.message.includes('cancelled'))) {
            console.log('[Firebase] Falling back to web authentication');
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
          } else {
            throw error;
          }
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
      console.log('[Firebase] Starting sign out process');
      if (Capacitor.isNativePlatform()) {
        console.log('[Firebase] Native platform - current user before sign out:', auth.currentUser?.uid);
        await FirebaseAuthentication.signOut();
        console.log('[Firebase] Native sign out complete - current user:', auth.currentUser?.uid);
        await firebaseSignOut(auth);
        console.log('[Firebase] Web sign out complete - current user:', auth.currentUser?.uid);
      } else {
        console.log('[Firebase] Web platform - current user before sign out:', auth.currentUser?.uid);
        await firebaseSignOut(auth);
        console.log('[Firebase] Web sign out complete - current user:', auth.currentUser?.uid);
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
      console.log('[Firebase] Setting up native auth state listener');
      // For native platforms, we need to listen to the plugin's auth state changes
      FirebaseAuthentication.addListener('authStateChange', (event) => {
        console.log('[Firebase] Native auth state change event:', {
          eventUser: event.user?.uid,
          currentUser: auth.currentUser?.uid,
          eventType: event.type
        });

        const currentUser = auth.currentUser;

        if (currentUser && event.user && currentUser.uid === event.user.uid) {
          console.log('[Firebase] Auth state unchanged - same user');
          return;
        }

        if (event.user) {
          // User is signed in
          console.log('[Firebase] Auth state changed to signed in user:', event.user.uid);
          // hack because I used the wrong capitalization
          const userClone = { photoURL: event.user.photoUrl, ...event.user };
          callback(userClone as unknown as User);
        } else {
          console.log('[Firebase] Auth state changed to signed out');
          callback(null);
        }
      });

      // Return a function to remove the listener
      return () => {
        console.log('[Firebase] Removing native auth state listener');
        FirebaseAuthentication.removeAllListeners();
      };
    } else {
      console.log('[Firebase] Setting up web auth state listener');
      // For web, use the standard Firebase auth state change
      return onAuthStateChanged(auth, (user) => {
        console.log('[Firebase] Web auth state change:', {
          newUser: user?.uid,
          currentUser: auth.currentUser?.uid
        });
        callback(user);
      });
    }
  }

  /**
   * Sign in with Apple
   * @returns Promise that resolves when sign-in is complete
   */
  static async signInWithApple(): Promise<void> {
    console.log('[Firebase] Starting Apple sign-in process');
    try {
      if (Capacitor.isNativePlatform()) {
        console.log('[Firebase] Using native Apple Sign In');
        try {
          // First ensure we're signed out
          console.log('[Firebase] Ensuring user is signed out before Apple sign-in');
          await FirebaseService.signOut();
          console.log('[Firebase] Sign out complete');

          if (Capacitor.getPlatform() === 'ios' && SignInWithApple) {
            // Configure Apple Sign In options
            console.log('[Firebase] Configuring Apple Sign In options');
            const options = {
              clientId: process.env.FIREBASE_AUTH_DOMAIN || '',
              redirectURI: `${window.location.origin}/login`,
              scopes: 'email name',
              state: Math.random().toString(36).substring(7),
              nonce: Math.random().toString(36).substring(7)
            };
            console.log('[Firebase] Apple Sign In options configured:', options);

            // Use the native plugin
            console.log('[Firebase] Calling SignInWithApple.authorize');
            const result = await SignInWithApple.authorize(options);
            console.log('[Firebase] Native Apple sign-in raw result:', result);

            if (!result || !result.response) {
              console.error('[Firebase] No result from native sign-in');
              throw new Error('No result from native sign-in');
            }

            // Create Firebase credential from Apple ID token
            console.log('[Firebase] Creating Firebase credential from Apple ID token');
            const provider = new OAuthProvider('apple.com');
            const credential = provider.credential({
              idToken: result.response.identityToken,
              accessToken: result.response.authorizationCode,
              rawNonce: options.nonce
            });
            console.log('[Firebase] Firebase credential created');

            // Sign in to Firebase with the credential
            console.log('[Firebase] Signing in to Firebase with credential');
            await signInWithCredential(auth, credential);
            console.log('[Firebase] Firebase sign-in complete');
          } else {
            // For Android or web, use Firebase's built-in Apple Sign In
            console.log('[Firebase] Using Firebase built-in Apple Sign In');
            const provider = new OAuthProvider('apple.com');
            await signInWithPopup(auth, provider);
          }

          // Add debug statement here
          console.log('[Firebase] Credential sign-in completed, current user:',
            auth.currentUser ? {
              uid: (auth.currentUser as User).uid,
              email: (auth.currentUser as User).email,
              displayName: (auth.currentUser as User).displayName
            } : 'Still null');

        } catch (error: unknown) {
          console.error('[Firebase] Plugin error:', error);
          // If we get a specific error about credentials, try web fallback
          if (error instanceof Error &&
              (error.message.includes('credentials') || error.message.includes('cancelled'))) {
            console.log('[Firebase] Falling back to web authentication');
            const provider = new OAuthProvider('apple.com');
            await signInWithPopup(auth, provider);
          } else {
            throw error;
          }
        }
      } else {
        console.log('[Firebase] Using web authentication');
        const provider = new OAuthProvider('apple.com');
        await signInWithPopup(auth, provider);
      }
    } catch (error) {
      console.error('[Firebase] Error signing in with Apple:', error);
      throw error;
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
        const username = await this.generateUniqueUsername(
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
        lastVisit: Date.now(),
        cityCoordinates: preferences.cityCoordinates || null
      }, { merge: true }); // Use merge to preserve other fields
    } catch (error) {
      console.error('Error saving preferences:', error);
      throw error;
    }
  }

  /**
   * Save user push notification token to Firestore
   * @param userId User ID
   * @param token Push notification token
   * @param platform Platform identifier (ios, android, web)
   */
  static async saveUserPushToken(userId: string, token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
    try {
      // Create a unique ID for the token
      const tokenId = `${userId}_${token.substring(0, 8)}`;

      // Save to push_tokens collection
      await setDoc(doc(db, 'push_tokens', tokenId), {
        userId,
        token,
        platform,
        createdAt: new Date(),
        lastUsed: new Date()
      });

      // Also update the user's pushNotificationsEnabled flag
      await setDoc(doc(db, 'users', userId), {
        pushNotificationsEnabled: true,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving push token:', error);
      throw error;
    }
  }

  /**
   * Get all push tokens for a user
   * @param userId User ID
   * @returns Array of push tokens
   */
  static async getUserPushTokens(userId: string): Promise<PushToken[]> {
    try {
      const tokensRef = collection(db, 'push_tokens');
      const q = query(tokensRef, where('userId', '==', userId));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
        lastUsed: doc.data().lastUsed.toDate()
      })) as PushToken[];
    } catch (error) {
      console.error('Error getting user push tokens:', error);
      throw error;
    }
  }

  /**
   * Delete a push token
   * @param tokenId Token ID to delete
   */
  static async deletePushToken(tokenId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'push_tokens', tokenId));
    } catch (error) {
      console.error('Error deleting push token:', error);
      throw error;
    }
  }

  /**
   * Update the last used timestamp for a push token
   * @param tokenId Token ID to update
   */
  static async updateTokenLastUsed(tokenId: string): Promise<void> {
    try {
      await setDoc(doc(db, 'push_tokens', tokenId), {
        lastUsed: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error updating token last used:', error);
      throw error;
    }
  }

  /**
   * Update username in all user's images
   * @param userId User ID
   * @param newUsername New username
   */
  static async updateUserWithNewUsername(userId: string, newUsername: string): Promise<void> {
    try {
      // Query all images uploaded by this user
      const imagesRef = collection(db, 'images');
      const q = query(imagesRef, where('userId', '==', userId));
      const querySnapshot = await getDocs(q);

      // Query all sits uploaded by this user
      const sitsRef = collection(db, 'sits');
      const sitsQuery = query(sitsRef, where('uploadedBy', '==', userId));
      const sitsSnapshot = await getDocs(sitsQuery);

      if (querySnapshot.empty && sitsSnapshot.empty) {
        return; // No documents to update
      }

      // Use a batch write for efficiency
      const batch = writeBatch(db);

      // Add each image document to the batch update
      querySnapshot.forEach((imageDoc) => {
        batch.update(doc(db, 'images', imageDoc.id), {
          userName: newUsername
        });
      });

      // Add each sit document to the batch update
      sitsSnapshot.forEach((sitDoc) => {
        batch.update(doc(db, 'sits', sitDoc.id), {
          uploadedByUsername: newUsername
        });
      });

      // Commit the batch
      await batch.commit();
      console.log(`Updated userName in ${querySnapshot.size} images and ${sitsSnapshot.size} sits`);
    } catch (error) {
      console.error('Error updating documents with new username:', error);
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
   * @returns Sit object
   */
  static async getSit(sitId: string): Promise<Sit> {
    try {
      const sitRef = doc(db, 'sits', sitId);
      const sitDoc = await getDoc(sitRef);
      const sitData = sitDoc.data();

      if (!sitData) throw new Error('Sit not found');

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
   * Create a sit in Firestore
   * @param coordinates Location coordinates
   * @param imageCollectionId Image collection ID
   * @param userId User ID
   * @param userName The user's display name
   * @returns Created sit
   */
  static async createSit(coordinates: Location, imageCollectionId: string, userId: string, userName: string): Promise<Sit> {
    try {
      const sitRef = doc(collection(db, 'sits'));
      const sitData = {
        location: coordinates,
        imageCollectionId,
        createdAt: new Date(),
        uploadedBy: userId,
        uploadedByUsername: userName
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
  ): Promise<{ sit: Sit, image: Image }> {
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
      const imageDoc = await addDoc(collection(db, 'images'), {
        photoURL,
        userId,
        userName,
        collectionId: imageCollectionId,
        createdAt: new Date(),
        width: photoResult.dimensions.width,
        height: photoResult.dimensions.height
      });

      const image: Image = {
        id: imageDoc.id,
        photoURL,
        userId,
        userName,
        collectionId: imageCollectionId,
        createdAt: new Date(),
        width: photoResult.dimensions.width,
        height: photoResult.dimensions.height
      };

      // Create the sit
      const sit = await this.createSit(photoResult.location, imageCollectionId, userId, userName);

      return { sit, image };
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
      // Check if user is authenticated
      if (!ValidationUtils.isUserAuthenticated(userId)) {
        throw new Error("You must be logged in to add a photo");
      }

      // Check if the location is valid
      if (!ValidationUtils.isLocationValid(photoResult.location)) {
        throw new Error("Valid location data is required to add a photo");
      }

      // Check if user already has an image in this collection
      const existingImages = await this.getImages(imageCollectionId);
      const canAddPhoto = ValidationUtils.canUserAddPhotoToSit(
        imageCollectionId,
        userId,
        true, // isOnline
        existingImages
      );

      if (!canAddPhoto) {
        throw new Error("You've already added a photo to this sit");
      }

      // Check if photo location is near the sit
      const sit = await this.getSitByCollectionId(imageCollectionId);
      if (sit && !ValidationUtils.isLocationNearSit(photoResult.location, sit)) {
        throw new Error("Photo location is too far from the sit location");
      }

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

      console.log(`Added photo to sit at filename ${filename} and id ${imageDoc.id}`);

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
      throw error;
    }
  }

  /**
   * Delete a sit
   * @param sitId Sit ID
   * @returns Whether deletion was successful
   */
  static async deleteSit(sitId: string): Promise<boolean> {
    try {
      // Get the sit first to verify ownership
      const sitRef = doc(db, 'sits', sitId);
      const sitDoc = await getDoc(sitRef);

      if (!sitDoc.exists()) {
        console.log(`Sit ${sitId} not found`);
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
          await this.deleteSit(sitId);
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
   * Records that a user has seen (viewed) a specific sit
   * @param userId ID of the user who viewed the sit
   * @param sitId ID of the sit that was viewed
   */
  static async markSitAsSeen(userId: string, sitId: string): Promise<void> {
    if (!userId || !sitId) return;

    try {
      const seenRef = doc(db, 'seen', `${userId}_${sitId}`);

      // Use a compound ID to ensure uniqueness and easy querying
      await setDoc(seenRef, {
        userId,
        sitId
      });

      console.log(`Marked sit ${sitId} as seen by user ${userId}`);
    } catch (error) {
      console.error('Error marking sit as seen:', error);
      // We don't throw here because this is a non-critical operation
      // If it fails, we don't want to interrupt the user experience
    }
  }

  /**
   * Gets all sits that a user has seen
   * @param userId ID of the user
   * @returns A Set of sit IDs that the user has seen
   */
  static async getUserSeenSits(userId: string): Promise<Set<string>> {
    if (!userId) return new Set();

    try {
      const seenQuery = query(
        collection(db, 'seen'),
        where('userId', '==', userId)
      );

      const seenSnapshot = await getDocs(seenQuery);
      const seenSits = new Set<string>();

      seenSnapshot.forEach(doc => {
        const data = doc.data();
        seenSits.add(data.sitId);
      });

      return seenSits;
    } catch (error) {
      console.error('Error getting user seen sits:', error);
      return new Set();
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
  ): Promise<Image> {
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
      // We're online, validate first using ValidationUtils directly
      let canReplaceImage = false;

      // For temporary images, use ValidationUtils directly
      if (imageId.startsWith('temp_')) {
        canReplaceImage = ValidationUtils.canUserReplaceImage(imageId, userId, true);
      } else {
        // Get the image document
        const imageDoc = await getDoc(doc(db, 'images', imageId));
        if (!imageDoc.exists()) {
          throw new Error('Image not found');
        }

        // Convert to Image type
        const imageData = imageDoc.data();
        const image = {
          id: imageId,
          photoURL: imageData.photoURL || '',
          userId: imageData.userId,
          userName: imageData.userName,
          collectionId: imageData.collectionId,
          createdAt: imageData.createdAt.toDate(),
          width: imageData.width || undefined,
          height: imageData.height || undefined
        };

        // Use ValidationUtils directly
        canReplaceImage = ValidationUtils.canUserReplaceImage(imageId, userId, true, image);
      }

      if (!canReplaceImage) {
        throw new Error("You can only replace your own images");
      }

      // Proceed with replacement if validation passes
      console.log('[Firebase] Online, replacing image');

      // Delete the old image first
      await this.deleteImage(imageId, userId);

      // Then add a new photo
      return await this.addPhotoToSit(
        photoResult,
        imageCollectionId,
        userId,
        userName
      );
    } catch (error: any) {
      console.error('Error replacing image:', error);
      throw error;
    }
  }

  /**
   * Process all pending uploads from the OfflineService
   * @param onError Optional callback that will be called for each failed upload
   * @returns Promise that resolves when all uploads are processed
   */
  static async processPendingUploads(
    onError: (uploadId: string, error: any) => void = () => {}
  ): Promise<void> {
    try {
      if (!this.isOnline()) {
        console.log('[Firebase] Cannot process uploads while offline');
        return;
      }

      const offlineService = OfflineService.getInstance();

      // Process new sits
      const pendingNewSits = offlineService.getPendingNewSits();
      for (const upload of pendingNewSits) {
        try {
          const fullUpload = await offlineService.getFullPendingUpload(upload.id);
          if (!fullUpload || !('photoResult' in fullUpload)) {
            await offlineService.removePendingUpload(upload.id);
            continue;
          }

          await this.createSitWithPhoto(
            fullUpload.photoResult,
            fullUpload.userId,
            fullUpload.userName
          );
          await offlineService.removePendingUpload(upload.id);
        } catch (error) {
          console.error('[Firebase] Error processing new sit upload:', error);
          onError(upload.id, error);
        }
      }

      // Process add to existing sits
      const pendingAddToSits = offlineService.getPendingAddToSits();
      for (const upload of pendingAddToSits) {
        try {
          const fullUpload = await offlineService.getFullPendingUpload(upload.id);
          if (!fullUpload || !('photoResult' in fullUpload)) {
            await offlineService.removePendingUpload(upload.id);
            continue;
          }

          const existingImages = await this.getImages(upload.imageCollectionId);
          const canAddPhoto = ValidationUtils.canUserAddPhotoToSit(
            upload.imageCollectionId,
            upload.userId,
            true,
            existingImages
          );

          if (!canAddPhoto) {
            onError(upload.id, new Error('You already have an image in this collection'));
            continue;
          }

          await this.addPhotoToSit(
            fullUpload.photoResult,
            upload.imageCollectionId,
            upload.userId,
            upload.userName
          );
          await offlineService.removePendingUpload(upload.id);
        } catch (error) {
          console.error('[Firebase] Error processing add to sit upload:', error);
          onError(upload.id, error);
        }
      }

      // Process replace images
      const pendingReplaceImages = offlineService.getPendingReplaceImages();
      for (const upload of pendingReplaceImages) {
        try {
          const fullUpload = await offlineService.getFullPendingUpload(upload.id);
          if (!fullUpload || !('photoResult' in fullUpload)) {
            await offlineService.removePendingUpload(upload.id);
            continue;
          }

          let canReplaceImage = false;
          if (upload.imageId.startsWith('temp_')) {
            canReplaceImage = ValidationUtils.canUserReplaceImage(upload.imageId, upload.userId, true);
          } else {
            const imageDoc = await getDoc(doc(db, 'images', upload.imageId));
            if (imageDoc.exists()) {
              const imageData = imageDoc.data();
              const image = {
                id: upload.imageId,
                photoURL: imageData.photoURL || '',
                userId: imageData.userId,
                userName: imageData.userName,
                collectionId: imageData.collectionId,
                createdAt: imageData.createdAt.toDate(),
                width: imageData.width || undefined,
                height: imageData.height || undefined
              };

              canReplaceImage = ValidationUtils.canUserReplaceImage(upload.imageId, upload.userId, true, image);
            }
          }

          if (!canReplaceImage) {
            onError(upload.id, new Error('You cannot replace this image'));
            continue;
          }

          await this.replaceImage(
            fullUpload.photoResult,
            upload.imageCollectionId,
            upload.imageId,
            upload.userId,
            upload.userName
          );
          await offlineService.removePendingUpload(upload.id);
        } catch (error) {
          console.error('[Firebase] Error processing replace image upload:', error);
          onError(upload.id, error);
        }
      }

      // Process pending deletions
      const pendingDeletions = offlineService.getPendingImageDeletions();
      for (const deletion of pendingDeletions) {
        try {
          await FirebaseService.deleteImage(deletion.imageId, deletion.userId);
          await offlineService.removePendingUpload(deletion.id);
        } catch (error) {
          console.error(`[FirebaseService] Error processing pending deletion ${deletion.id}:`, error);
          onError(deletion.id, error);
        }
      }

      console.log('[Firebase] Finished processing pending uploads');

    } catch (error) {
      console.error('[Firebase] Error in processPendingUploads:', error);
      throw error;
    }
  }

  /**
   * Get a sit by its image collection ID
   * @param imageCollectionId The image collection ID
   * @returns Sit object or null if not found
   */
  static async getSitByCollectionId(imageCollectionId: string): Promise<Sit | null> {
    try {
      const sitsRef = collection(db, 'sits');
      const q = query(sitsRef, where('imageCollectionId', '==', imageCollectionId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return null;
      }

      // There should be only one sit with this collection ID
      const sitDoc = querySnapshot.docs[0];
      const sitData = sitDoc.data();

      return {
        id: sitDoc.id,
        location: {
          latitude: sitData.location.latitude,
          longitude: sitData.location.longitude
        },
        imageCollectionId: sitData.imageCollectionId,
        createdAt: sitData.createdAt,
        uploadedBy: sitData.uploadedBy
      };
    } catch (error) {
      console.error('Error getting sit by collection ID:', error);
      return null;
    }
  }

  /**
   * Check if a username is already taken by another user
   * @param username The username to check
   * @param currentUserId The current user's ID (to exclude from the check)
   * @param originalUsername The user's original username (to skip check if unchanged)
   * @returns Promise<boolean> True if the username is taken, false otherwise
   */
  static async isUsernameTaken(
    username: string,
    currentUserId?: string,
    originalUsername?: string
  ): Promise<boolean> {
    // Skip check if it's the user's current username
    if (originalUsername && username === originalUsername) {
      return false;
    }

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', username));
      const querySnapshot = await getDocs(q);

      // If currentUserId is provided, exclude the current user from the check
      if (currentUserId) {
        return querySnapshot.docs.some(doc => doc.id !== currentUserId);
      }

      return !querySnapshot.empty;
    } catch (error) {
      console.error('Error checking username:', error);
      return false; // Assume it's not taken if there's an error
    }
  }

    /**
   * Generates a unique username based on user information
   * @param userId The user's ID (to exclude from uniqueness check)
   * @param displayName The user's display name (optional)
   * @returns Promise<string> A unique username
   */
  static async generateUniqueUsername(
    userId: string,
    displayName?: string | null
  ): Promise<string> {
    // Create base name from user info
    let baseName = '';
    if (displayName) {
      baseName = displayName.split(' ')[0];
    } else {
      baseName = `user${Math.floor(Math.random() * 1000)}`;
    }

    // Clean up the name (remove special chars, lowercase)
    let cleanName = baseName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Ensure minimum length
    if (cleanName.length < 3) {
      cleanName = `user${userId.substring(0, 5)}`;
    }

    // Try the base name first
    let uniqueName = cleanName;
    let counter = 1;

    // Keep trying until we find a unique name
    while (await this.isUsernameTaken(uniqueName, userId)) {
      uniqueName = `${cleanName}${counter}`;
      counter++;
    }

    return uniqueName;
  };

  /**
   * Update the user's push notification setting in Firestore
   * @param userId User ID
   * @param enabled Whether push notifications are enabled
   */
  static async updatePushNotificationSetting(userId: string, enabled: boolean): Promise<void> {
    try {
      await setDoc(doc(db, 'users', userId), {
        pushNotificationsEnabled: enabled,
        updatedAt: new Date()
      }, { merge: true });

      console.log(`[Firebase] Updated pushNotificationsEnabled to ${enabled} for user ${userId}`);
    } catch (error) {
      console.error('[Firebase] Error updating push notification setting:', error);
      throw error;
    }
  }
}

// Export auth for direct access (moved outside the class)
export { auth };