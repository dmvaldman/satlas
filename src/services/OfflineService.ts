import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { PhotoResult, Sit, Image } from '../types';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Define explicit types for different kinds of pending uploads
export enum PendingUploadType {
  NEW_SIT = 'NEW_SIT',
  ADD_TO_EXISTING_SIT = 'ADD_TO_EXISTING_SIT',
  REPLACE_IMAGE = 'REPLACE_IMAGE',
  DELETE_IMAGE = 'DELETE_IMAGE'
}

// Define the schema for our IndexedDB
interface OfflineImagesDB extends DBSchema {
  images: {
    key: string;
    value: {
      id: string;
      data: string;
      timestamp: number;
    };
  };
}

// Base interface for all pending uploads
interface BasePendingUpload {
  id: string;
  type: PendingUploadType;
  timestamp: number;
}

// New sit upload
export interface NewSitPendingUpload extends BasePendingUpload {
  type: PendingUploadType.NEW_SIT;
  tempSit: Sit;
  tempImage: Image;
}

// Add photo to existing sit
export interface AddToSitPendingUpload extends BasePendingUpload {
  type: PendingUploadType.ADD_TO_EXISTING_SIT;
  tempImage: Image;
  sit: Sit;
}

// Replace existing image
export interface ReplaceImagePendingUpload extends BasePendingUpload {
  type: PendingUploadType.REPLACE_IMAGE;
  tempImage: Image;
  imageId: string;
  sit: Sit;
}

// Add an interface for deletion operations
export interface DeleteImagePendingUpload extends BasePendingUpload {
  type: PendingUploadType.DELETE_IMAGE;
  imageId: string;
  userId: string;
}

// Union type for all pending upload types
export type PendingUpload = NewSitPendingUpload | AddToSitPendingUpload | ReplaceImagePendingUpload | DeleteImagePendingUpload;

export class OfflineError extends Error {}
export class OfflineSuccess extends Error {}

export class OfflineService {
  private static instance: OfflineService;
  private isOnline: boolean = navigator.onLine;
  private pendingUploads: PendingUpload[] = [];
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private networkListener: any = null; // Store the network listener reference
  private isInitialized: boolean = false; // Track initialization state
  private db: IDBPDatabase<OfflineImagesDB> | null = null; // IndexedDB instance

  public static getInstance(): OfflineService {
    if (!OfflineService.instance) {
      OfflineService.instance = new OfflineService();
    }
    return OfflineService.instance;
  }

  public async initialize(): Promise<void> {
    // Prevent multiple initializations
    if (this.isInitialized) {
      console.log('[OfflineService] Already initialized, skipping');
      return;
    }

    console.log('[OfflineService] Initializing...');

    // Clean up any existing listeners before reinitializing
    await this.cleanup();

    // Initialize IndexedDB for web platforms
    if (!Capacitor.isNativePlatform()) {
      try {
        this.db = await openDB<OfflineImagesDB>('offline-images-db', 1, {
          upgrade(db) {
            // Create a store for images if it doesn't exist
            if (!db.objectStoreNames.contains('images')) {
              db.createObjectStore('images', { keyPath: 'id' });
              console.log('[OfflineService] Created IndexedDB store for images');
            }
          },
        });
        console.log('[OfflineService] IndexedDB initialized successfully');
      } catch (error) {
        console.error('[OfflineService] Error initializing IndexedDB:', error);
        this.db = null;
      }
    }

    // Load any saved pending uploads
    console.log('[OfflineService] Loading pending uploads during initialization');
    await this.loadPendingUploads();
    console.log('[OfflineService] Current pending uploads after loading:', this.pendingUploads.length);

    // Set up network status listeners
    if (Capacitor.isNativePlatform()) {
      // Use Capacitor Network plugin for native platforms
      const status = await Network.getStatus();
      this.isOnline = status.connected;
      console.log('[OfflineService] Initial network status:', this.isOnline ? 'online' : 'offline');

      // Store the listener reference so we can remove it later
      this.networkListener = Network.addListener('networkStatusChange', (status) => {
        console.log(`[OfflineService] Network status changed - Connected: ${status.connected}, Type: ${status.connectionType}, Previous: ${this.isOnline}, Time: ${new Date().toISOString()}`);

        // Only process if this is a real state change
        if (status.connected !== this.isOnline) {
          this.isOnline = status.connected;
          this.notifyListeners();
        }
      });
    } else {
      // Use browser events for web
      this.isOnline = navigator.onLine;
      console.log('[OfflineService] Initial network status:', this.isOnline ? 'online' : 'offline');

      // Store the listener references so we can remove them later
      this.networkListener = {
        online: () => {
          console.log('[OfflineService] Browser is online');
          this.isOnline = true;
          this.notifyListeners();
        },
        offline: () => {
          console.log('[OfflineService] Browser is offline');
          this.isOnline = false;
          this.notifyListeners();
        }
      };

      window.addEventListener('online', this.networkListener.online);
      window.addEventListener('offline', this.networkListener.offline);
    }

    this.isInitialized = true;
    console.log('[OfflineService] Initialization complete');
  }

  public async cleanup(): Promise<void> {
    console.log('[OfflineService] Cleaning up...');

    // Close IndexedDB connection if open
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[OfflineService] Closed IndexedDB connection');
    }

    // Remove network listeners
    if (Capacitor.isNativePlatform() && this.networkListener) {
      try {
        // Remove all listeners as a safety measure
        await Network.removeAllListeners();
        console.log('[OfflineService] Removed native network listeners');
      } catch (error) {
        console.error('[OfflineService] Error removing network listeners:', error);
      }
      this.networkListener = null;
    } else if (this.networkListener) {
      window.removeEventListener('online', this.networkListener.online);
      window.removeEventListener('offline', this.networkListener.offline);
      this.networkListener = null;
      console.log('[OfflineService] Removed web network listeners');
    }

    // Clear all status listeners
    this.listeners.clear();
    this.isInitialized = false;
    console.log('[OfflineService] Cleanup complete');
  }

  public isNetworkOnline(): boolean {
    return this.isOnline;
  }

  public addStatusListener(listener: (isOnline: boolean) => void): () => void {
    this.listeners.add(listener);

    // Return function to remove listener
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.isOnline));
  }

  // Add a new sit with photo
  public async createSitWithImage(
    tempSit: Sit,
    tempImage: Image
  ): Promise<string> {
    console.log('[OfflineService] Adding new pending sit for user:', tempSit.uploadedBy);
    const id = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;


    const pendingUpload: NewSitPendingUpload = {
      id,
      type: PendingUploadType.NEW_SIT,
      timestamp: Date.now(),
      tempSit,
      tempImage
    };

    // Save the image data to filesystem if on native platform
    const strippedUpload = await this.stripImageFromPendingUpload(id, pendingUpload) as NewSitPendingUpload;
    this.pendingUploads.push(strippedUpload);

    await this.savePendingUploads();

    return id;
  }

  // Add a photo to an existing sit
  public async addImageToSit(
    tempImage: Image,
    sit: Sit
  ): Promise<string> {
    console.log('[OfflineService] Adding image to sit for user:', tempImage.userId);
    const id = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    let pendingUpload: AddToSitPendingUpload = {
      id,
      type: PendingUploadType.ADD_TO_EXISTING_SIT,
      timestamp: Date.now(),
      tempImage,
      sit
    };

    // Save the image data to filesystem if on native platform
    const strippedUpload = await this.stripImageFromPendingUpload(id, pendingUpload) as AddToSitPendingUpload;
    this.pendingUploads.push(strippedUpload);

    await this.savePendingUploads();

    return id;
  }

  private async stripImageFromPendingUpload(id: string, upload: PendingUpload): Promise<PendingUpload> {
    // Skip if this is a delete operation or there's no image data
    if (upload.type === PendingUploadType.DELETE_IMAGE || !upload.tempImage || !upload.tempImage.base64Data) {
      return upload; // No image data to process
    }

    const base64Data = upload.tempImage.base64Data;

    if (Capacitor.isNativePlatform()) {
      await this.saveImageToFileSystem(id, base64Data);

      // Replace the base64 data with a file reference
      const strippedUpload = { ...upload }; // Create a copy to avoid modifying the original pendingUploads array directly
      strippedUpload.tempImage = { ...strippedUpload.tempImage, base64Data: `file:${id}` };
      return strippedUpload;
    }
    else {
      // For web, save to IndexedDB
      await this.saveImageToIndexedDB(id, base64Data);

      // Replace the base64 data with a reference
      const strippedUpload = { ...upload };
      strippedUpload.tempImage = { ...strippedUpload.tempImage, base64Data: `idb:${id}` };
      return strippedUpload;
    }
  }

  // Replace an existing image
  public async replaceImageInSit(
    tempImage: Image,
    imageId: string,
    sit: Sit
  ): Promise<string> {
    console.log('[OfflineService] Replacing image in sit for user:', tempImage.userId);
    const id = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    let pendingUpload: ReplaceImagePendingUpload = {
      id,
      type: PendingUploadType.REPLACE_IMAGE,
      timestamp: Date.now(),
      tempImage,
      imageId,
      sit
    };

    const strippedUpload = await this.stripImageFromPendingUpload(id, pendingUpload) as ReplaceImagePendingUpload;
    this.pendingUploads.push(strippedUpload);

    await this.savePendingUploads();

    return id;
  }

  // Add this new method to queue image deletions
  public async deleteImageFromSit(
    imageId: string,
    userId: string
  ): Promise<string> {
    const id = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const pendingDeletion: DeleteImagePendingUpload = {
      id,
      type: PendingUploadType.DELETE_IMAGE,
      imageId,
      userId,
      timestamp: Date.now()
    };

    this.pendingUploads.push(pendingDeletion);

    await this.savePendingUploads();

    return id;
  }

  private async saveImageToFileSystem(id: string, base64Data: string): Promise<void> {
    try {
      // Clean the data - remove any existing data URL prefix and any whitespace
      const cleanData = base64Data.replace(/^data:image\/\w+;base64,/, '').trim();

      // Create directory if it doesn't exist
      try {
        await Filesystem.mkdir({
          path: 'offline_uploads',
          directory: Directory.Cache,
          recursive: true
        });
      } catch (e) {
        // Directory might already exist, that's fine
      }

      await Filesystem.writeFile({
        path: `offline_uploads/${id}.jpg`,
        data: cleanData,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });
    } catch (error) {
      console.error('[OfflineService] Error saving image to filesystem:', error);
      // Remove the pending upload if saving fails
      await this.removePendingUpload(id);
      throw error;
    }
  }

  private async getImageFromFileSystem(id: string): Promise<string> {
    try {
      console.log('[OfflineService] Reading file from filesystem:', id);
      const result = await Filesystem.readFile({
        path: `offline_uploads/${id}.jpg`,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });

      // Convert to string if it's a Blob
      const data = typeof result.data === 'string' ? result.data : await result.data.text();

      // Clean the data - remove any existing data URL prefix and any whitespace
      const cleanData = data.replace(/^data:image\/\w+;base64,/, '').trim();

      // Add the data URL prefix back
      return `data:image/jpeg;base64,${cleanData}`;
    } catch (error) {
      console.error('[OfflineService] Error reading image from filesystem:', error);
      throw error;
    }
  }

  private async deleteImageFromFileSystem(id: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `offline_uploads/${id}.jpg`,
        directory: Directory.Cache
      });
    } catch (error) {
      console.error('Error deleting image from filesystem:', error);
      // Don't throw, just log the error
    }
  }

  private async saveImageToIndexedDB(id: string, base64Data: string): Promise<void> {
    try {
      if (!this.db) {
        throw new Error('IndexedDB not initialized');
      }

      // Clean the data (optional - might want to keep the data URL prefix for web)
      const data = base64Data;

      await this.db.put('images', {
        id,
        data,
        timestamp: Date.now()
      });

      console.log('[OfflineService] Successfully saved image to IndexedDB:', id);
    } catch (error) {
      console.error('[OfflineService] Error saving image to IndexedDB:', error);
      // Remove the pending upload if saving fails
      await this.removePendingUpload(id);
      throw error;
    }
  }

  private async getImageFromIndexedDB(id: string): Promise<string> {
    try {
      if (!this.db) {
        throw new Error('IndexedDB not initialized');
      }

      console.log('[OfflineService] Reading image from IndexedDB:', id);
      const image = await this.db.get('images', id);

      if (!image) {
        throw new Error(`Image with ID ${id} not found in IndexedDB`);
      }

      return image.data;
    } catch (error) {
      console.error('[OfflineService] Error reading image from IndexedDB:', error);
      throw error;
    }
  }

  private async deleteImageFromIndexedDB(id: string): Promise<void> {
    try {
      if (!this.db) {
        throw new Error('IndexedDB not initialized');
      }

      await this.db.delete('images', id);
      console.log('[OfflineService] Deleted image from IndexedDB:', id);
    } catch (error) {
      console.error('[OfflineService] Error deleting image from IndexedDB:', error);
      // Don't throw, just log the error
    }
  }

  private async savePendingUploads(): Promise<void> {
    try {
      console.log('[OfflineService] Saving pending uploads:', this.pendingUploads.length);
      const data = JSON.stringify(this.pendingUploads);

      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: 'pending_uploads.json',
          data,
          directory: Directory.Cache,
          encoding: Encoding.UTF8
        });
        console.log('[OfflineService] Successfully saved pending uploads to filesystem');
      } else {
        localStorage.setItem('pendingUploads', data);
        console.log('[OfflineService] Successfully saved pending uploads to localStorage');
      }
    } catch (error) {
      console.error('[OfflineService] Error saving pending uploads:', error);
    }
  }

  private async loadPendingUploads(): Promise<void> {
    try {
      console.log('[OfflineService] Loading pending uploads');
      let data: string | null = null;

      if (Capacitor.isNativePlatform()) {
        try {
          const result = await Filesystem.readFile({
            path: 'pending_uploads.json',
            directory: Directory.Cache,
            encoding: Encoding.UTF8
          });
          data = result.data as string;
          console.log('[OfflineService] Successfully loaded pending uploads from filesystem');
        } catch (e) {
          console.log('[OfflineService] No pending uploads found in filesystem');
          data = null;
        }
      } else {
        data = localStorage.getItem('pendingUploads');
        console.log('[OfflineService] Loaded pending uploads from localStorage:', data ? 'found' : 'not found');
      }

      if (data) {
        this.pendingUploads = JSON.parse(data);
        console.log('[OfflineService] Loaded pending uploads:', this.pendingUploads.length);
      } else {
        console.log('[OfflineService] No pending uploads to load');
        this.pendingUploads = [];
      }
    } catch (error) {
      console.error('[OfflineService] Error loading pending uploads:', error);
      this.pendingUploads = [];
    }
  }

  public async removePendingUpload(id: string): Promise<void> {
    const upload = this.pendingUploads.find(upload => upload.id === id);
    if (!upload) return;

    // Handle image deletion based on platform
    if ((upload.type === PendingUploadType.REPLACE_IMAGE ||
         upload.type === PendingUploadType.ADD_TO_EXISTING_SIT ||
         upload.type === PendingUploadType.NEW_SIT) &&
        typeof upload.tempImage.base64Data === 'string') {

      if (Capacitor.isNativePlatform() && upload.tempImage.base64Data.startsWith('file:')) {
        // Delete from filesystem for native platforms
        const fileId = upload.tempImage.base64Data.substring(5);
        await this.deleteImageFromFileSystem(fileId);
      }
      else if (!Capacitor.isNativePlatform() && upload.tempImage.base64Data.startsWith('idb:')) {
        // Delete from IndexedDB for web platforms
        const idbId = upload.tempImage.base64Data.substring(4);
        await this.deleteImageFromIndexedDB(idbId);
      }
    }

    this.pendingUploads = this.pendingUploads.filter(upload => upload.id !== id);
    await this.savePendingUploads();
  }

  public getPendingUploads(): PendingUpload[] {
    return [...this.pendingUploads];
  }

  public async getFullPendingUpload(id: string): Promise<PendingUpload | null> {
    const upload = this.pendingUploads.find(upload => upload.id === id);
    if (!upload) return null;

    // We only need to process uploads with images
    if ((upload.type === PendingUploadType.REPLACE_IMAGE ||
         upload.type === PendingUploadType.ADD_TO_EXISTING_SIT ||
         upload.type === PendingUploadType.NEW_SIT) &&
        typeof upload.tempImage.base64Data === 'string') {

      try {
        let base64Data: string;

        if (Capacitor.isNativePlatform() && upload.tempImage.base64Data.startsWith('file:')) {
          // Load from filesystem for native platforms
          const fileId = upload.tempImage.base64Data.substring(5);
          base64Data = await this.getImageFromFileSystem(fileId);
        }
        else if (!Capacitor.isNativePlatform() && upload.tempImage.base64Data.startsWith('idb:')) {
          // Load from IndexedDB for web platforms
          const idbId = upload.tempImage.base64Data.substring(4);
          base64Data = await this.getImageFromIndexedDB(idbId);
        }
        else {
          // No transformation needed
          return { ...upload };
        }

        // Process the upload with the loaded image data
        return {
          ...upload,
          tempImage: {
            ...upload.tempImage,
            base64Data
          }
        };
      } catch (error) {
        console.error('[OfflineService] Error loading image data:', error);
        // If we can't load the file, remove it from pending uploads
        await this.removePendingUpload(id);
        return null;
      }
    }

    return { ...upload };
  }

  // Helper methods to get specific types of pending uploads
  public getPendingNewSits(): NewSitPendingUpload[] {
    return this.pendingUploads.filter(
      (upload): upload is NewSitPendingUpload => upload.type === PendingUploadType.NEW_SIT
    );
  }

  public getPendingAddToSits(): AddToSitPendingUpload[] {
    return this.pendingUploads.filter(
      (upload): upload is AddToSitPendingUpload => upload.type === PendingUploadType.ADD_TO_EXISTING_SIT
    );
  }

  public getPendingReplaceImages(): ReplaceImagePendingUpload[] {
    return this.pendingUploads.filter(
      (upload): upload is ReplaceImagePendingUpload => upload.type === PendingUploadType.REPLACE_IMAGE
    );
  }

  /**
   * Check if there are pending uploads and we're online
   * @returns true if there are pending uploads that can be processed
   */
  public hasPendingUploadsToProcess(): boolean {
    return this.isOnline && this.pendingUploads.length > 0;
  }

  // Add helper method to get pending deletions
  public getPendingImageDeletions(): DeleteImagePendingUpload[] {
    return this.pendingUploads.filter(
      (upload): upload is DeleteImagePendingUpload => upload.type === PendingUploadType.DELETE_IMAGE
    );
  }
}

export default OfflineService;