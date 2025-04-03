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
import {
  OfflineService,
  OfflineSuccess,
  PendingUploadType
} from './OfflineService';
import { ValidationUtils } from '../utils/ValidationUtils';

// Conditionally import Apple Sign In plugin only for iOS
let SignInWithApple: any;
const loadAppleSignIn = async () => {
  if (Capacitor.getPlatform() === 'ios') {
    try {
      // Use window.require to avoid Vite's static analysis
      // @ts-ignore
      const module = window.require('@capacitor-community/apple-sign-in');
      SignInWithApple = module.SignInWithApple;
    } catch (error) {
      console.log('[Firebase] Apple Sign In module not available:', error);
      SignInWithApple = null;
    }
  }
};

// Load Apple Sign In module if we're on iOS
loadAppleSignIn().catch(error => {
  console.error('[Firebase] Error loading Apple Sign In module:', error);
  SignInWithApple = null;
});

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
// This needs to be done before any auth operations
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('[Firebase] Error setting persistence:', error);
});

// Firebase Service class with static methods
export class FirebaseService {
  // Export Firebase instances for direct use if needed
  static auth = auth;
  static db = db;
  static storage = storage;
  static temporaryImages: Map<string, Image> = new Map();
  static tempImageMapping: Map<string, string | null> = new Map(); // Maps temp IDs to real Firebase IDs
  static tempSitMapping: Map<string, string | null> = new Map(); // Maps temp IDs to real Firebase IDs

  // static addTemporaryImage(image: Image) {
  //   this.temporaryImages.set(image.id, image);
  // }

  static getTemporaryImage(imageId: string) {
    return this.temporaryImages.get(imageId);
  }

  static getTemporaryImagesByCollectionId(collectionId: string) {
    return Array.from(this.temporaryImages.values()).filter(image => image.collectionId === collectionId);
  }

  // static removeTemporaryImage(imageId: string) {
  //   this.temporaryImages.delete(imageId);
  // }

  // static clearTemporaryImages() {
  //   this.temporaryImages.clear();
  // }

  static addTempImageMapping(tempId: string, realId: string | null) {
    this.tempImageMapping.set(tempId, realId);
  }

  static getTempImageMapping(tempId: string) {
    return this.tempImageMapping.get(tempId);
  }

  static addTempSitMapping(tempId: string, realId: string | null) {
    this.tempSitMapping.set(tempId, realId);
  }

  static getTempSitMapping(tempId: string) {
    return this.tempSitMapping.get(tempId);
  }



  /**
   * Check if the app is online
   * @returns true if online, false if offline
   */
  static isOnline(): boolean {
    // Use the OfflineService to check network status
    return OfflineService.getInstance().isNetworkOnline();
  }

  // ===== Authentication Methods =====

  /**
   * Sign in with Google
   * @returns Promise that resolves when sign-in is complete
   */
  static async signInWithGoogle(): Promise<void> {
    console.log('[Firebase] Starting Google sign-in process');
    try {
      // First ensure we're signed out
      console.log('[Firebase] Ensuring user is signed out');
      await FirebaseService.signOut();
      console.log('[Firebase] User signed out successfully');

      if (Capacitor.isNativePlatform()) {
        console.log('[Firebase] Using native authentication');
        try {
          // Check if the plugin is available
          if (!FirebaseAuthentication) {
            console.error('[Firebase] FirebaseAuthentication plugin not available');
            throw new Error('FirebaseAuthentication plugin not available');
          }

          console.log('[Firebase] Calling FirebaseAuthentication.signInWithGoogle');
          const result = await FirebaseAuthentication.signInWithGoogle();
          console.log('[Firebase] Native Google sign-in completed successfully');

          if (!result?.credential?.idToken || !result?.credential?.accessToken) {
            throw new Error('Invalid credential received from native sign-in');
          }

          // Create a credential from the native result
          const credential = GoogleAuthProvider.credential(
            result.credential.idToken,
            result.credential.accessToken
          );

          // Sign in to Firebase with the credential
          console.log('[Firebase] Signing in to Firebase with credential');
          const userCredential = await signInWithCredential(auth, credential);
          console.log('[Firebase] Firebase sign-in complete, user:', {
            uid: userCredential.user.uid,
            email: userCredential.user.email,
            displayName: userCredential.user.displayName
          });

          // Verify the current user
          const currentUser = auth.currentUser;
          console.log('[Firebase] Current user after credential sign-in:', {
            hasUser: !!currentUser,
            userId: currentUser?.uid
          });

          if (!currentUser) {
            throw new Error('Failed to get current user after sign-in');
          }
        } catch (error) {
          console.error('[Firebase] Native sign-in error:', error);
          throw error;
        }
      } else {
        console.log('[Firebase] Using web authentication');
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        console.log('[Firebase] Web Google sign-in completed successfully');
      }
    } catch (error) {
      console.error('[Firebase] Error signing in with Google:', error);
      throw error;
    }
  }

  /**
   * Sign in with Apple
   * @returns Promise that resolves when sign-in is complete
   */
    static async signInWithApple(): Promise<void> {
      console.log('[Firebase] Starting Apple sign-in process');
      try {
        // First ensure we're signed out
        await FirebaseService.signOut();

        if (Capacitor.isNativePlatform()) {
          console.log('[Firebase] Using native Apple Sign In');
          try {
            if (Capacitor.getPlatform() === 'ios' && SignInWithApple) {
              // Configure Apple Sign In options
              console.log('[Firebase] Configuring Apple Sign In options');
              const options = {
                clientId: process.env.APPLE_SERVICE_ID || '', // Should be your Apple Service ID
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

              if (!result.response.identityToken) {
                console.error('[Firebase] No identity token in response');
                throw new Error('No identity token received from Apple');
              }

              // Create Firebase credential from Apple ID token
              console.log('[Firebase] Creating Firebase credential from Apple ID token');
              const provider = new OAuthProvider('apple.com');
              const credential = provider.credential({
                idToken: result.response.identityToken,
                rawNonce: options.nonce
              });
              console.log('[Firebase] Firebase credential created');

              // Sign in to Firebase with the credential
              console.log('[Firebase] Signing in to Firebase with credential');
              const userCredential = await signInWithCredential(auth, credential);
              console.log('[Firebase] Firebase sign-in complete, user:', {
                uid: userCredential.user.uid,
                email: userCredential.user.email,
                displayName: userCredential.user.displayName
              });

              // Verify the current user
              const currentUser = auth.currentUser;
              if (!currentUser) {
                console.error('[Firebase] No current user after credential sign-in');
                throw new Error('Failed to get current user after sign-in');
              }

              console.log('[Firebase] Current user verified:', {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName
              });

            } else {
              // For Android or web, use Firebase's built-in Apple Sign In
              console.log('[Firebase] Using Firebase built-in Apple Sign In');
              const provider = new OAuthProvider('apple.com');
              await signInWithPopup(auth, provider);
            }
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
          currentUser: auth.currentUser?.uid
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
  static async loadSitsFromBounds(bounds: { north: number; south: number }): Promise<Map<string, Sit>> {
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
   * Load sits within a 100m radius of a location
   * @param location Location
   * @returns Map of sits
   */
  static async loadSitsNearLocation(location: Location): Promise<Map<string, Sit>> {
    const bounds = {
      north: location.latitude + 0.01,
      south: location.latitude - 0.01
    };
    return this.loadSitsFromBounds(bounds);
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
   * Create a sit with a photo
   * @param tempSit The temporary sit
   * @param tempImage The temporary image
   * @param validate Whether to validate the sit and image
   * @returns Promise resolving to the created sit
   * @throws Error when offline
   */
  static async createSitWithImage(
    tempSit: Sit,
    tempImage: Image,
    validate?: boolean
  ): Promise<{ sit: Sit, image: Image }> {

    this.addTempSitMapping(tempSit.id, null);
    this.addTempImageMapping(tempImage.id, null);

    // Check if we're online
    if (!this.isOnline()) {
      try {
        console.log('[Firebase] Offline, adding to pending uploads queue');
        await OfflineService.getInstance().createSitWithImage(
          tempSit,
          tempImage
        );
        throw new OfflineSuccess("Photo saved and will upload when you're back online");
      } catch (error: any) {
        throw error;
      }
    }

    if (validate) {
      // Check if we can create the sit
      const nearbySits = await this.loadSitsNearLocation(tempSit.location);
      const nearbySitsArray = Array.from(nearbySits.values());

      const canCreateSit = ValidationUtils.canUserCreateSitAtLocation(
        tempSit.location,
        tempSit.uploadedBy,
        nearbySitsArray
      );

      if (!canCreateSit) {
        throw new Error("Sit already exists at this location");
      }
    }

    try {
      const sit = await this._createSit(tempSit);
      const image = await this._createImage(tempImage);

      this.addTempSitMapping(tempSit.id, sit.id);
      this.addTempImageMapping(tempImage.id, image.id);

      return { sit, image };
    } catch (error: any) {
      console.error('Error creating sit with photo:', error);
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
    static async addImageToSit(
      photoResult: PhotoResult,
      imageCollectionId: string,
      userId: string,
      userName: string,
      validate?: boolean
    ): Promise<Image> {
      // Check if we're online
      if (!this.isOnline()) {
        try {
          // Add to pending uploads
          await OfflineService.getInstance().addImageToSit(
            photoResult,
            imageCollectionId,
            userId,
            userName
          );

          // Throw a success error to indicate offline handling
          throw new OfflineSuccess("Photo saved and will upload when you're back online");
        } catch (error: any) {
          throw error;
        }
      }

      try {
        if (validate) {
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
          const canAddPhoto = ValidationUtils.canUserAddImageToSit(
            imageCollectionId,
            userId,
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
        }

        const image = await this._createImage(photoResult, userId, userName);
        return image;
      } catch (error: any) {
        console.error('Error adding photo to sit:', error);
        throw error;
      }
    }

  /**
   * Create an image in Firestore
   * @param photoResult The photo result containing base64 data
   * @param userId The user ID
   * @param userName The user's display name
   * @returns Promise resolving to the created image
   */
  static async _createImage(tempImage: Image): Promise<Image> {
    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);

    if (!tempImage.base64Data) {
      throw new Error('Base64 data is required to create an image');
    }

    // Detect content type from base64 data
    let contentType = 'image/jpeg'; // Default
    if (tempImage.base64Data.startsWith('data:')) {
      const matches = tempImage.base64Data.match(/^data:([A-Za-z-+/]+);base64,/);
      if (matches && matches.length > 1) {
        contentType = matches[1];
      }
    }

    const base64WithoutPrefix = tempImage.base64Data.replace(/^data:image\/\w+;base64,/, '');

    // Add metadata with detected content type
    const metadata = {
      contentType: contentType
    };

    // Upload with metadata
    await uploadString(storageRef, base64WithoutPrefix, 'base64', metadata);

    // Use CDN URL
    const photoURL = `https://satlas-world.web.app/images/sits/${filename}`;

    // Create image collection
    // Remove base64Data from upload. Rely on photoURL to get the image
    const imageDoc = await addDoc(collection(db, 'images'), {
      photoURL: photoURL,
      userId: tempImage.userId,
      userName: tempImage.userName,
      collectionId: tempImage.collectionId,
      createdAt: new Date(),
      width: tempImage.width,
      height: tempImage.height
    });

    // Add base64Data back in in memory
    const image: Image = {
      id: imageDoc.id,
      photoURL: photoURL,
      userId: tempImage.userId,
      userName: tempImage.userName,
      collectionId: tempImage.collectionId,
      createdAt: new Date(),
      width: tempImage.width,
      height: tempImage.height,
      base64Data: tempImage.base64Data
    };

    return image;
  }

  /**
   * Create a sit in Firestore
   * @param coordinates Location coordinates
   * @param imageCollectionId Image collection ID
   * @param userId User ID
   * @param userName The user's display name
   * @returns Created sit
   */
  static async _createSit(tempSit: Sit): Promise<Sit> {
    try {
      const sitDoc = await addDoc(collection(db, 'sits'), tempSit);

      const sit: Sit = {
        id: sitDoc.id,
        location: tempSit.location,
        imageCollectionId: tempSit.imageCollectionId,
        createdAt: tempSit.createdAt,
        uploadedBy: tempSit.uploadedBy,
        uploadedByUsername: tempSit.uploadedByUsername
      };

      return sit;
    } catch (error) {
      console.error('Error creating sit:', error);
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
  static async replaceImageInSit(
    photoResult: PhotoResult,
    imageCollectionId: string,
    imageId: string,
    userId: string,
    userName: string
  ): Promise<Image> {
    // Check if we're online
    if (!this.isOnline()) {
      try {
        // Add to pending uploads
        await OfflineService.getInstance().replaceImageInSit(
          photoResult,
          imageCollectionId,
          imageId,
          userId,
          userName
        );

        // Throw a success error to indicate offline handling
        throw new OfflineSuccess("Photo saved and will upload when you're back online");
      } catch (error: any) {
        throw error;
      }
    }

    try {
      // Delete the old image first
      await this.deleteImageFromSit(imageId, userId);

      // Then add a new photo
      return await this.addImageToSit(
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
   * Delete an image
   * @param imageId Image ID
   * @param userId User ID
   */
  static async deleteImageFromSit(imageId: string, userId: string): Promise<void> {
    if (!this.isOnline()) {
      try {
        // If we're offline, queue the deletion
        const offlineService = OfflineService.getInstance();
        await offlineService.deleteImageFromSit(
          imageId,
          userId
        );
        throw new OfflineSuccess("Photo will be deleted when you're back online");
      } catch (error: any) {
        throw error;
      }
    }

    try {
      // Get image data first
      const imageDoc = await getDoc(doc(db, 'images', imageId));
      if (!imageDoc.exists()) throw new Error('Image not found');

      const imageData = imageDoc.data();

      // Verify ownership
      if (imageData.userId !== userId && userId !== 'bEorC36iZYZGWKydUqFo6VZ7RSn2') {
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
      const validate = true; // Keep validation enabled

      // Get all pending uploads and sort them by timestamp
      const allPendingUploads = offlineService.getPendingUploads();
      allPendingUploads.sort((a, b) => a.timestamp - b.timestamp);

      console.log(`[Firebase] Processing ${allPendingUploads.length} pending uploads chronologically`);

      for (const upload of allPendingUploads) {
        try {
          // Handle different upload types
          switch (upload.type) {
            case PendingUploadType.NEW_SIT: {
              const fullUpload = await offlineService.getFullPendingUpload(upload.id);
              if (!fullUpload || !('photoResult' in fullUpload)) {
                console.warn(`[Firebase] Invalid NEW_SIT upload data for ${upload.id}, removing.`);
                await offlineService.removePendingUpload(upload.id);
                continue; // Skip to the next upload
              }
              console.log(`[Firebase] Processing NEW_SIT upload: ${upload.id}`);
              await this.createSitWithImage(
                fullUpload.photoResult,
                fullUpload.userId,
                fullUpload.userName,
                validate
              );
              await offlineService.removePendingUpload(upload.id);
              break;
            }
            case PendingUploadType.ADD_TO_EXISTING_SIT: {
              const fullUpload = await offlineService.getFullPendingUpload(upload.id);
              if (!fullUpload || !('photoResult' in fullUpload) || !('imageCollectionId' in fullUpload) || !('userName' in fullUpload)) {
                console.warn(`[Firebase] Invalid ADD_TO_EXISTING_SIT upload data for ${upload.id}, removing.`);
                await offlineService.removePendingUpload(upload.id);
                continue;
              }
              console.log(`[Firebase] Processing ADD_TO_EXISTING_SIT upload: ${upload.id}`);
              await this.addImageToSit(
                fullUpload.photoResult,
                fullUpload.imageCollectionId,
                fullUpload.userId,
                fullUpload.userName,
                validate
              );
              await offlineService.removePendingUpload(upload.id);
              break;
            }
            case PendingUploadType.REPLACE_IMAGE: {
              const fullUpload = await offlineService.getFullPendingUpload(upload.id);
              if (!fullUpload || !('photoResult' in fullUpload) || !('imageCollectionId' in fullUpload) || !('imageId' in fullUpload)) {
                 console.warn(`[Firebase] Invalid REPLACE_IMAGE upload data for ${upload.id}, removing.`);
                await offlineService.removePendingUpload(upload.id);
                continue;
              }
              console.log(`[Firebase] Processing REPLACE_IMAGE upload: ${upload.id}`);
              // Note: Validation logic might be needed here depending on requirements
              await this.replaceImageInSit(
                fullUpload.photoResult,
                fullUpload.imageCollectionId,
                fullUpload.imageId,
                fullUpload.userId,
                fullUpload.userName
              );
              await offlineService.removePendingUpload(upload.id);
              break;
            }
            case PendingUploadType.DELETE_IMAGE: {
              console.log(`[Firebase] Processing DELETE_IMAGE upload: ${upload.id}`);
              await FirebaseService.deleteImageFromSit(upload.imageId, upload.userId);
              await offlineService.removePendingUpload(upload.id);
              break;
            }
            default:
              // Handle unknown upload types if necessary
              console.warn(`[Firebase] Unknown pending upload type: ${(upload as any).type}`);
              continue; // Skip unknown types
          }

          console.log(`[Firebase] Successfully processed and removed upload: ${upload.id}`);

        } catch (error: any) {
          // Handle errors for individual uploads
          console.error(`[Firebase] Error processing upload ${upload.id} (Type: ${upload.type}):`, error);
          onError(upload.id, error);
        }
      }

      console.log('[Firebase] Finished processing pending uploads');

    } catch (error) {
      console.error('[Firebase] Error in processPendingUploads:', error);
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
   * Get images for a sit
   * @param collectionId Collection ID
   * @returns Array of images
   */
  static async getImages(collectionId: string): Promise<Image[]> {
    const temporaryImages = this.getTemporaryImagesByCollectionId(collectionId);

    try {
      console.log('Fetching images for collection:', collectionId);

      const imagesRef = collection(db, 'images');
      const q = query(
        imagesRef,
        where('collectionId', '==', collectionId)
      );

      const snapshot = await getDocs(q);
      return [...temporaryImages, ...snapshot.docs.map(doc => ({
        id: doc.id,
        photoURL: doc.data().photoURL || '',
        userId: doc.data().userId,
        userName: doc.data().userName,
        collectionId: doc.data().collectionId,
        createdAt: doc.data().createdAt.toDate(),
        width: doc.data().width || undefined,
        height: doc.data().height || undefined
      }))];
    } catch (error) {
      return temporaryImages;
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