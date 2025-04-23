import { initializeApp, FirebaseApp, getApps, getApp } from 'firebase/app';
import {
  User,
  getAuth,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  initializeAuth,
  indexedDBLocalPersistence,
  Auth,
  OAuthProvider,
  setPersistence,
  signInWithRedirect,
  getRedirectResult,
  signInWithPopup
} from 'firebase/auth';
import {
  getFirestore,
  persistentLocalCache,
  memoryLocalCache,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  addDoc,
  writeBatch,
  Firestore,
  initializeFirestore
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  deleteObject
} from 'firebase/storage';
import { Sit, Image, Location, UserPreferences, MarkType, PushToken } from '../types';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  OfflineService,
  OfflineSuccess,
  PendingUploadType
} from './OfflineService';
import { ValidationUtils } from '../utils/ValidationUtils';

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

// Initialize Firebase App only if it hasn't been initialized yet
let app: FirebaseApp;
if (getApps().length === 0) {
  console.log("[Firebase] Initializing Firebase App...");
  app = initializeApp(firebaseConfig);
} else {
  console.log("[Firebase] Getting existing Firebase App...");
  app = getApp(); // Get the already initialized app
}

// Use getAuth - it should handle retrieving the existing instance correctly
let auth: Auth = getAuth(app);
console.log(`[Firebase] Using ${Capacitor.isNativePlatform() ? 'Native' : 'Web'} Auth instance.`);

// Set persistence explicitly AFTER getting the auth instance, only for native
// Use an IIAFE for the async call at the top level
(async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      console.log("[Firebase] Attempting to set indexedDBLocalPersistence...");
      await setPersistence(auth, indexedDBLocalPersistence);
      console.log("[Firebase] Successfully set indexedDBLocalPersistence.");
    } catch (error) {
      // Errors might occur if persistence was already set or other issues
      console.error("[Firebase] Error setting indexedDBLocalPersistence (may be expected if already set):", error);
    }
  }
})();

// --- Initialize Firestore with Persistence Check ---
let db: Firestore;
const firestoreCacheSizeBytes = 100 * 1024 * 1024; // 100 MB

// Attempt to get existing Firestore instance first
try {
  console.log("[Firebase] Attempting to get existing Firestore instance...");
  db = getFirestore(app);
  console.log("[Firebase] Got existing Firestore instance.");
} catch (e) {
  // If getFirestore throws without settings, it likely means it needs initialization
  console.log("[Firebase] Firestore instance not found or needs settings, initializing...");
  try {
      console.log(`[Firebase] Initializing Firestore with persistentLocalCache (size: ${firestoreCacheSizeBytes} bytes)...`);
      // Initialize with settings
      db = initializeFirestore(app, {
          localCache: persistentLocalCache({cacheSizeBytes: firestoreCacheSizeBytes})
      });
      console.log("[Firebase] Firestore initialized with explicit persistence.");
  } catch (error) {
      console.error("[Firebase] Error initializing Firestore with persistent cache:", error);
      console.log("[Firebase] Falling back to in-memory Firestore cache.");
      // Initialize with fallback settings
      db = initializeFirestore(app, {localCache: memoryLocalCache()});
  }
}
// --- End Firestore Initialization ---

const storage = getStorage(app);

// Helper function (can be moved to utils if used elsewhere)
function base64ToBlob(base64: string, contentType: string = 'image/jpeg'): Blob {
    // Remove potential Data URI prefix before decoding
    const base64WithoutPrefix = base64.replace(/^data:image\/\w+;base64,/, '');
    const byteCharacters = atob(base64WithoutPrefix);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
}

// Helper to check if we should use signInWithPopup
const shouldUsePopupFlow = () => {
    // Use popup if NODE_ENV is development
    if (process.env.NODE_ENV === 'development') {
        return true;
    }
    // Use popup if running on web (not native) and accessed via localhost or local IP
    if (!Capacitor.isNativePlatform()) {
        const hostname = window.location.hostname;
        // Basic checks for localhost and common private IP ranges
        if (hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) // Regex for 172.16.0.0 - 172.31.255.255
        {
            return true;
        }
    }
    // Otherwise (production web on custom domain, or native), use the standard flow
    return false;
};

// Firebase Service class with static methods
export class FirebaseService {
  static auth = auth;
  static db = db;
  static storage = storage;
  static tempImageMapping: Map<string, string | null> = new Map(); // Maps temp IDs to real Firebase IDs
  static tempSitMapping: Map<string, string | null> = new Map(); // Maps temp IDs to real Firebase IDs
  static tempImages: Map<string, Image> = new Map(); // In-memory storage for temporary images

  // ===== Temporary Image Mapping =====
  /**
   * Add a temporary image mapping
   * @param tempId Temporary ID
   * @param realId Real ID
   */
  static addTempImageMapping(tempId: string, realId: string | null) {
    console.log('[Firebase] Adding temp image mapping:', { tempId, realId });
    this.tempImageMapping.set(tempId, realId);
  }

  /**
   * Get a temporary image mapping
   * @param tempId Temporary ID
   * @returns Real ID
   */
  static getTempImageMapping(tempId: string) {
    return this.tempImageMapping.get(tempId);
  }

  /**
   * Remove a temporary image mapping
   * @param tempId Temporary ID
   */
  static removeTempImageMapping(tempId: string) {
    console.log('[Firebase] Removing temp image mapping:', { tempId });
    this.tempImageMapping.delete(tempId);
  }

  // ===== Temporary Sit Mapping =====
  /**
   * Add a temporary sit mapping
   * @param tempId Temporary ID
   * @param realId Real ID
   */
  static addTempSitMapping(tempId: string, realId: string | null) {
    this.tempSitMapping.set(tempId, realId);
  }

  /**
   * Get a temporary sit mapping
   * @param tempId Temporary ID
   * @returns Real ID
   */
  static getTempSitMapping(tempId: string) {
    return this.tempSitMapping.get(tempId);
  }

  /**
   * Remove a temporary sit mapping
   * @param tempId Temporary ID
   */
  static removeTempSitMapping(tempId: string) {
    console.log('[Firebase] Removing temp sit mapping:', { tempId });
    this.tempSitMapping.delete(tempId);
  }

  // ===== Temporary Images In-Memory Storage =====
  /**
   * Add a temporary image to in-memory storage
   * @param image The temporary image to store
   */
  static addTempImage(image: Image) {
    console.log('[Firebase] Adding temp image to in-memory storage:', image.id);
    this.tempImages.set(image.id, image);
    console.log('NUM TEMP IMAGES', this.tempImages.size);
  }

  /**
   * Get all temporary images for a collection
   * @param collectionId The collection ID to filter by
   * @returns Array of temporary images for the collection
   */
  static getTempImagesForCollection(collectionId: string): Image[] {
    const images: Image[] = [];
    this.tempImages.forEach(image => {
      if (image.collectionId === collectionId) {
        images.push(image);
      }
    });
    return images;
  }

  /**
   * Remove a temporary image from in-memory storage
   * @param imageId The ID of the image to remove
   */
  static removeTempImage(imageId: string) {
    console.log('[Firebase] Removing temp image from in-memory storage:', imageId);
    if (this.tempImages.has(imageId)) {
      this.tempImages.delete(imageId);
      console.log('NUM TEMP IMAGES', this.tempImages.size);
    }
    else {
      console.log('[Firebase] Temp image not found in in-memory storage:', imageId);
    }
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
      console.log('[Firebase] Ensuring user is signed out');
      await FirebaseService.signOut().catch(err => console.warn('[Firebase] Non-critical sign out error:', err));
      console.log('[Firebase] Sign out check complete');

      if (Capacitor.isNativePlatform()) {
        console.log('[Firebase] Using native authentication for Google');
        try {
          if (!FirebaseAuthentication) {
            console.error('[Firebase] FirebaseAuthentication plugin not available');
            throw new Error('FirebaseAuthentication plugin not available');
          }
          console.log('[Firebase] Calling FirebaseAuthentication.signInWithGoogle');
          const result = await FirebaseAuthentication.signInWithGoogle();
          console.log('[Firebase] Native Google sign-in raw result:', result);
          if (!result?.credential) {
            console.error('[Firebase] No credential received from native Google sign-in');
            throw new Error('No credential received from native Google sign-in');
          }
          console.log('[Firebase] Native Google sign-in seems complete via plugin.');

        } catch (error) {
          console.error('[Firebase] Native Google sign-in error:', error);
          throw error;
        }

      } else if (shouldUsePopupFlow()) {
        // --- WEB POPUP FLOW (Dev, Localhost, Local IP) ---
        console.log('[Firebase] Using web popup authentication for Google');
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        console.log('[Firebase] Web Google sign-in popup completed.');
      } else {
        // --- WEB REDIRECT FLOW (Prod Custom Domain) ---
        console.log('[Firebase] Using web redirect authentication for Google');
        // Use signInWithRedirect instead of signInWithPopup
        const provider = new GoogleAuthProvider();
        await signInWithRedirect(auth, provider);
        console.log('[Firebase] Web Google sign-in redirect initiated.');
        // No return needed here, redirect handles flow
      }
    } catch (error) {
      console.error('[Firebase] Error during Google sign-in process:', error);
      // Re-throw error to be caught by UI
      throw error;
    }
  }

  /**
   * Generate a secure nonce
   * @returns Promise that resolves to a secure nonce
   */
  static async generateSecureNonce(): Promise<string> {
    // Generate a random string of 32 alphanumeric characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);

    // Convert to alphanumeric string
    return Array.from(array)
      .map(x => chars[x % chars.length])
      .join('');
  }

  /**
   * Sign in with Apple
   * @returns Promise that resolves when sign-in is complete
   */
  static async signInWithApple(): Promise<void> {
    console.log('[Firebase] Starting Apple sign-in process');
    try {
      console.log('[Firebase] Ensuring user is signed out');
      await FirebaseService.signOut().catch(err => console.warn('[Firebase] Non-critical sign out error:', err));
      console.log('[Firebase] Sign out check complete');

      if (Capacitor.isNativePlatform()) {
        console.log('[Firebase] Using native authentication for Apple');
        try {
          if (!FirebaseAuthentication) {
            console.error('[Firebase] FirebaseAuthentication plugin not available');
            throw new Error('FirebaseAuthentication plugin not available');
          }
          console.log('[Firebase] Calling FirebaseAuthentication.signInWithApple');
          const result = await FirebaseAuthentication.signInWithApple();
          console.log('[Firebase] Native Apple sign-in raw result:', result);
          if (!result?.credential?.idToken) {
            console.error('[Firebase] No idToken received from native Apple sign-in');
            throw new Error('No idToken received from native Apple sign-in');
          }
          console.log('[Firebase] Native Apple sign-in seems complete via plugin.');
        } catch (error) {
          console.error('[Firebase] Native Apple sign-in error:', error);
          throw error;
        }

      } else if (shouldUsePopupFlow()) {
        // --- WEB POPUP FLOW (Dev, Localhost, Local IP) ---
        console.log('[Firebase] Using web popup authentication for Apple');
        const provider = new OAuthProvider('apple.com');
        await signInWithPopup(auth, provider);
        console.log('[Firebase] Web Apple sign-in popup completed.');
      } else {
        // --- WEB REDIRECT FLOW (Prod Custom Domain) ---
        console.log('[Firebase] Using web redirect authentication for Apple');
        // Use signInWithRedirect instead of signInWithPopup
        const provider = new OAuthProvider('apple.com');
        await signInWithRedirect(auth, provider);
        console.log('[Firebase] Web Apple sign-in redirect initiated.');
        // No return needed here, redirect handles flow
      }
    } catch (error) {
      console.error('[Firebase] Error during Apple sign-in process:', error);
      // Re-throw error to be caught by UI
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
          console.log('[Firebase] Native auth state changed to signed in user:', event.user.uid);

          // Use the helper method to get display name and photo URL
          const { displayName, photoURL } = this._extractUserInfo(event.user);

          // Construct the final user object for the callback
          const finalUser = {
            // Essential properties from event.user
            uid: event.user.uid,
            email: event.user.email,
            emailVerified: event.user.emailVerified,
            isAnonymous: event.user.isAnonymous,
            metadata: event.user.metadata,
            phoneNumber: event.user.phoneNumber,
            providerId: event.user.providerId,
            tenantId: event.user.tenantId,
            // Use the extracted values
            displayName: displayName,
            photoURL: photoURL,
            providerData: event.user.providerData || [],
             // Add other potentially missing properties if the native type differs significantly
          } as unknown as User; // Cast to unknown first to satisfy linter

          callback(finalUser);
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

        if (user) {
          // --- Use helper method for web ---
          // Use the helper method to get display name and photo URL
          const { displayName, photoURL } = this._extractUserInfo(user);

          // Construct the final user object, spreading original and overriding display info
          const finalUser = {
            ...user, // Spread all original user properties
            displayName: displayName, // Override with potentially updated value
            photoURL: photoURL,     // Override with potentially updated value
          } as User; // Web user object should already conform, but cast for consistency

          callback(finalUser); // Pass the potentially enhanced user object
          // --- End helper method usage ---
        } else {
          // User is signed out
          callback(null);
        }
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
          photoURL: user.photoURL,
          username_lowercase: username.toLowerCase()
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
   * @param displayName User display name
   * @returns User preferences
   */
  static async loadUserPreferences(userId: string, displayName: string | null): Promise<UserPreferences> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userPreferences = userDoc.data() as UserPreferences;

        // Validate username
        if (!userPreferences.username) {
          // If no username exists and we have a user, generate one
          const username = await this.generateUniqueUsername(
            userId,
            displayName || ''
          );
          userPreferences.username = username;
          // Save the updated preferences
          await this.saveUserPreferences(userId, userPreferences);
        }

        return userPreferences;
      } else {
        // Create the document if it doesn't exist
        const username = await this.generateUniqueUsername(
          userId,
          displayName || ''
        );
        const userPreferences = {
          username: username,
          pushNotificationsEnabled: false
        } as UserPreferences;

        await this.saveUserPreferences(userId, userPreferences);
        return userPreferences;
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
  static async saveUserPreferences(userId: string, preferences: UserPreferences, usernameChanged?: boolean): Promise<void> {
    try {
      // If username is not null and is different from the original username, update the images
      // get the original username from the database

      await setDoc(doc(db, 'users', userId), {
        username: preferences.username,
        pushNotificationsEnabled: preferences.pushNotificationsEnabled,
        lastVisit: Date.now(),
        cityCoordinates: preferences.cityCoordinates || null,
        username_lowercase: preferences.username?.toLowerCase() || ''
      }, { merge: true }); // Use merge to preserve other fields

      // If username is not null and is different from the original username, update the images
      if (usernameChanged === true || usernameChanged === undefined) {
        const userDoc = await getDoc(doc(db, 'users', userId));
        const originalUsername = userDoc.data()?.username;
        if (originalUsername !== preferences.username) {
          try {
            await FirebaseService.updateUserWithNewUsername(userId, preferences.username);
          } catch (error) {
            console.error('Error updating images with new username:', error);
          }
        }
      }
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
    // Convert username to check to lowercase for case-insensitive comparison
    const lowerCaseUsername = username.toLowerCase();

    // Skip check if it's the user's current username (case-insensitive check)
    if (originalUsername && lowerCaseUsername === originalUsername.toLowerCase()) {
      return false;
    }

    try {
      const usersRef = collection(db, 'users');
      // Query Firestore using the lowercase version
      const q = query(usersRef, where('username_lowercase', '==', lowerCaseUsername));
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
    displayName: string | null
  ): Promise<string> {
    // Create base name from user info
    let baseName = '';
    if (displayName) {
      baseName = displayName.split(' ')[0];
    } else {
      baseName = `user${Math.floor(Math.random() * 10000)}`;
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

      // Use getDocsFromServer or getDocsFromCache if specific source is needed
      // Default getDocs will try cache first when offline
      const querySnapshot = await getDocs(q);
      const sits = new Map<string, Sit>();

      // Log the source of the data
      const source = querySnapshot.metadata.fromCache ? "local cache" : "server";
      console.log(`[Firebase] loadSitsFromBounds: Data fetched from ${source}. Found ${querySnapshot.size} documents.`);

      querySnapshot.docs.forEach(doc => {
        const sitData = doc.data();
        const sit: Sit = {
          id: doc.id,
          location: {
            latitude: sitData.location.latitude,
            longitude: sitData.location.longitude
          },
          imageCollectionId: sitData.imageCollectionId,
          createdAt: sitData.createdAt, // Consider converting Timestamps if needed
          uploadedBy: sitData.uploadedBy,
          uploadedByUsername: sitData.uploadedByUsername
        };
        sits.set(sit.id, sit);
      });

      // If from cache and empty, log a specific message
      if (querySnapshot.metadata.fromCache && querySnapshot.empty) {
          console.log("[Firebase] loadSitsFromBounds: No documents found in cache for this query.");
      }

      return sits;
    } catch (error) {
      console.error('[Firebase] Error loading nearby sits:', error);
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
        uploadedBy: sitData.uploadedBy,
        uploadedByUsername: sitData.uploadedByUsername
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
    this.addTempImage(tempImage);

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

      return { sit, image };
    } catch (error: any) {
      console.error('Error creating sit with photo:', error);
      throw error;
    }
  }

  /**
   * Add a photo to an existing sit
   * @param photoResult The photo result containing base64 data
   * @param sit The sit
   * @param validate Whether to validate the sit and image
   * @returns Promise resolving to the created image
   * @throws Error when offline
   */
    static async addImageToSit(
      tempImage: Image,
      sit: Sit,
      validate?: boolean
    ): Promise<Image> {

      this.addTempImageMapping(tempImage.id, null);
      this.addTempImage(tempImage);

      // Check if we're online
      if (!this.isOnline()) {
        try {
          // Add to pending uploads
          await OfflineService.getInstance().addImageToSit(
            tempImage,
            sit
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
          if (!ValidationUtils.isUserAuthenticated(tempImage.userId)) {
            throw new Error("You must be logged in to add a photo");
          }

          if (!tempImage.location) {
            throw new Error("Photo location is required to add a photo to a sit");
          }

          // Check if the location is valid
          if (!ValidationUtils.isLocationValid(tempImage.location)) {
            throw new Error("Valid location data is required to add a photo");
          }

          // Check if photo location is near the sit
          if (sit && !ValidationUtils.isLocationNearSit(tempImage.location, sit)) {
            throw new Error("Photo location is too far from the sit location");
          }

          // Check if user already has an image in this collection
          const existingImages = await this.getImages(sit.imageCollectionId);
          const canAddPhoto = ValidationUtils.canUserAddImageToSit(
            sit.imageCollectionId,
            tempImage.userId,
            existingImages
          );

          if (!canAddPhoto) {
            throw new Error("You've already added a photo to this sit");
          }
        }

        const image = await this._createImage(tempImage);

        return image;
      } catch (error: any) {
        console.error('Error adding photo to sit:', error);
        throw error;
      }
    }

  /**
   * Create an image in Firestore
   * @param tempImage The temporary image (contains base64Data initially)
   * @returns Promise resolving to the created image (without base64Data)
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

    // Convert Base64 to Blob for upload
    const imageBlob = base64ToBlob(tempImage.base64Data, contentType);

    // Add metadata with detected content type
    const metadata = {
      contentType: contentType
    };

    // Upload Blob using uploadBytes
    console.log(`[Firebase] Uploading Blob (${(imageBlob.size / 1024).toFixed(2)} KB) with content type ${contentType}...`);
    await uploadBytes(storageRef, imageBlob, metadata);
    console.log(`[Firebase] Blob upload successful for ${filename}`);

    // Use CDN URL
    const photoURL = `https://satlas-world.web.app/images/sits/${filename}`; // Make sure this CDN URL is correct

    // Create image document in Firestore
    const imageDocData = {
      photoURL: photoURL,
      userId: tempImage.userId,
      userName: tempImage.userName,
      collectionId: tempImage.collectionId,
      createdAt: new Date(),
      width: tempImage.width,
      height: tempImage.height,
      location: tempImage.location
    };
    const imageDoc = await addDoc(collection(db, 'images'), imageDocData);

    // Construct the final Image object to return (WITHOUT base64Data)
    const image: Image = {
      id: imageDoc.id,
      createdAt: imageDocData.createdAt,
      photoURL: photoURL,
      userId: tempImage.userId,
      userName: tempImage.userName,
      collectionId: tempImage.collectionId,
      width: tempImage.width,
      height: tempImage.height,
      base64Data: tempImage.base64Data,
      location: tempImage.location
    };

    // Update mappings and remove temp data
    this.addTempImageMapping(tempImage.id, image.id);
    this.removeTempImage(tempImage.id);

    return image;
  }

  /**
   * Create a sit in Firestore
   * @param tempSit The temporary sit
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

      this.addTempSitMapping(tempSit.id, sit.id);

      return sit;
    } catch (error) {
      console.error('Error creating sit:', error);
      throw error;
    }
  }

  /**
   * Replace an existing image
   * @param tempImage The temporary image
   * @param imageId The image ID to replace
   * @param sit The sit
   * @throws Error when offline
   */
  static async replaceImageInSit(
    tempImage: Image,
    imageId: string,
    sit: Sit
  ): Promise<Image> {
    // Check if we're online
    if (!this.isOnline()) {
      try {
        // Add to pending uploads
        await OfflineService.getInstance().replaceImageInSit(
          tempImage,
          imageId,
          sit
        );

        // Throw a success error to indicate offline handling
        throw new OfflineSuccess("Photo saved and will upload when you're back online");
      } catch (error: any) {
        throw error;
      }
    }

    if (this.tempImageMapping.has(imageId)) {
      const realId = this.tempImageMapping.get(imageId);
      if (realId !== null && realId !== undefined) {
        imageId = realId;
      }
      else {
        throw new Error('Image not yet uploaded. Wait a moment and try again.');
      }
    }

    if (this.tempSitMapping.has(sit.id)) {
      const realId = this.tempSitMapping.get(sit.id);
      if (realId !== null && realId !== undefined) {
        sit.id = realId;
      }
      else {
        throw new Error('Sit not yet uploaded. Wait a moment and try again.');
      }
    }

    try {
      // Add a new photo first
      const newImage = await this.addImageToSit(tempImage, sit);

      // Delete the old image
      await this.deleteImageFromSit(imageId, tempImage.userId);

      return newImage;
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

    let tempImageId: string | null = null;
    if (this.tempImageMapping.has(imageId)) {
      const realId = this.tempImageMapping.get(imageId);
      if (realId !== null && realId !== undefined) {
        tempImageId = imageId;
        imageId = realId;
        this.removeTempImageMapping(tempImageId);
        this.removeTempImage(tempImageId);
      }
      else {
        throw new Error('Image not yet uploaded. Wait a moment and try again.');
      }
    }

    try {
      // Get image data first
      const imageDoc = await getDoc(doc(db, 'images', imageId));
      if (!imageDoc.exists()) {
        throw new Error('Image not found');
      }

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
              if (!fullUpload || !('tempSit' in fullUpload) || !('tempImage' in fullUpload)) {
                console.warn(`[Firebase] Invalid NEW_SIT upload data for ${upload.id}, removing.`);
                await offlineService.removePendingUpload(upload.id);
                continue; // Skip to the next upload
              }
              console.log(`[Firebase] Processing NEW_SIT upload: ${upload.id}`);
              await this.createSitWithImage(
                fullUpload.tempSit,
                fullUpload.tempImage,
                validate
              );
              await offlineService.removePendingUpload(upload.id);
              break;
            }
            case PendingUploadType.ADD_TO_EXISTING_SIT: {
              const fullUpload = await offlineService.getFullPendingUpload(upload.id);
              if (!fullUpload || !('tempImage' in fullUpload) || !('sit' in fullUpload)) {
                console.warn(`[Firebase] Invalid ADD_TO_EXISTING_SIT upload data for ${upload.id}, removing.`);
                await offlineService.removePendingUpload(upload.id);
                continue;
              }
              console.log(`[Firebase] Processing ADD_TO_EXISTING_SIT upload: ${upload.id}`);
              await this.addImageToSit(
                fullUpload.tempImage,
                fullUpload.sit,
                validate
              );
              await offlineService.removePendingUpload(upload.id);
              break;
            }
            case PendingUploadType.REPLACE_IMAGE: {
              const fullUpload = await offlineService.getFullPendingUpload(upload.id);
              if (!fullUpload || !('tempImage' in fullUpload) || !('imageId' in fullUpload) || !('sit' in fullUpload)) {
                console.warn(`[Firebase] Invalid REPLACE_IMAGE upload data for ${upload.id}, removing.`);
                await offlineService.removePendingUpload(upload.id);
                continue;
              }
              console.log(`[Firebase] Processing REPLACE_IMAGE upload: ${upload.id}`);
              // Note: Validation logic might be needed here depending on requirements
              await this.replaceImageInSit(
                fullUpload.tempImage,
                fullUpload.imageId,
                fullUpload.sit
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
          await offlineService.removePendingUpload(upload.id);
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
    let tempImages = this.getTempImagesForCollection(collectionId);

    try {
      console.log('Fetching images for collection:', collectionId);

      const imagesRef = collection(db, 'images');
      const q = query(
        imagesRef,
        where('collectionId', '==', collectionId)
      );

      const snapshot = await getDocs(q);
      const backendImages = snapshot.docs.map(doc => ({
        id: doc.id,
        photoURL: doc.data().photoURL,
        userId: doc.data().userId,
        userName: doc.data().userName,
        collectionId: doc.data().collectionId,
        createdAt: doc.data().createdAt.toDate(),
        width: doc.data().width || undefined,
        height: doc.data().height || undefined
      }));

      const combinedImages = new Map<string, Image>();

      // Loop through temp Images
      // If they have a realID remove them from tempImages
      // If their realID is in backendImages, don't add to uniqueImages
      // If they don't have a realId, add to uniqueImages
      // Append backendImages to the rest
      tempImages.forEach(image => {
        const realId = this.getTempImageMapping(image.id);
        if (realId) {
          // If the image is not in the backend, add it to the uniqueImages
          if (!backendImages.find(backendImage => backendImage.id === realId)) {
            combinedImages.set(image.id, image);
          }
        }
        else {
          // No realID. Still a temp image. Keep.
          combinedImages.set(image.id, image);
        }
      });

      // Append backendImages to the rest
      backendImages.forEach(image => {
        combinedImages.set(image.id, image);
      });

      return Array.from(combinedImages.values());
    } catch (error) {
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
        uploadedBy: sitData.uploadedBy,
        uploadedByUsername: sitData.uploadedByUsername
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

  /**
   * Helper method to extract displayName and photoURL, checking providerData as fallback.
   * @param user Raw user object from auth event/listener
   * @returns Object containing the best available displayName and photoURL
   */
  private static _extractUserInfo(user: any): { displayName: string | null, photoURL: string | null } {
    // Use 'any' for input type flexibility between native plugin and web SDK user objects
    // Native plugin uses photoUrl, web SDK uses photoURL
    let finalDisplayName = user.displayName || null;
    let finalPhotoURL = user.photoURL || user.photoUrl || null; // Handle both casings

    if ((!finalPhotoURL || !finalDisplayName) && user.providerData && user.providerData.length > 0) {
      console.log('[Firebase] _extractUserInfo: Checking providerData...');
      for (const provider of user.providerData) {
        if (provider.providerId === 'google.com') {
          if (!finalPhotoURL && provider.photoURL) { // Web SDK uses photoURL
            finalPhotoURL = provider.photoURL;
            console.log('[Firebase] _extractUserInfo: Found photoURL in Google providerData');
          } else if (!finalPhotoURL && provider.photoUrl) { // Native plugin might use photoUrl
             finalPhotoURL = provider.photoUrl;
             console.log('[Firebase] _extractUserInfo: Found photoUrl in Google providerData (native)');
          }
          if (!finalDisplayName && provider.displayName) {
            finalDisplayName = provider.displayName;
            console.log('[Firebase] _extractUserInfo: Found displayName in Google providerData');
          }
          if (finalDisplayName && finalPhotoURL) break;
        } else if (provider.providerId === 'apple.com') {
          // Apple data fallback (less likely to have photoURL)
           if (!finalPhotoURL && provider.photoURL) {
            finalPhotoURL = provider.photoURL;
             console.log('[Firebase] _extractUserInfo: Found photoURL in Apple providerData');
          } else if (!finalPhotoURL && provider.photoUrl) {
             finalPhotoURL = provider.photoUrl;
             console.log('[Firebase] _extractUserInfo: Found photoUrl in Apple providerData (native)');
          }
          if (!finalDisplayName && provider.displayName) {
            finalDisplayName = provider.displayName;
            console.log('[Firebase] _extractUserInfo: Found displayName in Apple providerData');
          }
          if (finalDisplayName && finalPhotoURL) break;
        }
      }
    }
    return { displayName: finalDisplayName, photoURL: finalPhotoURL };
  }

  // --- Redirect Handling Logic ---
  static initializeRedirectHandling() {
    // Only check for redirect result if NOT using popup flow and on web
    if (!shouldUsePopupFlow() && !Capacitor.isNativePlatform()) {
      (async () => {
        try {
          console.log('[Firebase] Checking for redirect result (prod web custom domain)...');
          const result = await getRedirectResult(auth);
          if (result) {
            console.log('[Firebase] Handled redirect result. User:', result.user.uid);
            FirebaseService.ensureUserExists(result.user);
          } else {
            console.log('[Firebase] No redirect result found.');
          }
        } catch (error) {
          console.error('[Firebase] Error getting redirect result:', error);
        }
      })();
    } else {
       console.log('[Firebase] Skipping redirect check (popup flow or native)');
    }
  }
}

// Export the initialized auth instance if needed elsewhere
export { auth };