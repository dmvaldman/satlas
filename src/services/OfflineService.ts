import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Sit, Image } from '../types';
import FileStorageService from './FileStorageService';

// Define explicit types for different kinds of pending uploads
export enum PendingUploadType {
  NEW_SIT = 'NEW_SIT',
  ADD_TO_EXISTING_SIT = 'ADD_TO_EXISTING_SIT',
  REPLACE_IMAGE = 'REPLACE_IMAGE',
  DELETE_IMAGE = 'DELETE_IMAGE'
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

// Helper functions for safely encoding/decoding Unicode strings with base64
function utf8ToBase64(str: string): string {
  // For base64 image data, we need to handle the data URI prefix
  if (str.startsWith('data:')) {
    // Extract the base64 part after the comma
    const base64Part = str.split(',')[1];
    return base64Part;
  }

  // For regular JSON strings, use the standard encoding
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

function base64ToUtf8(str: string): string {
  // For base64 image data, we need to reconstruct the data URI
  if (str.match(/^[A-Za-z0-9+/=]+$/)) {
    // If it's pure base64 (no data URI prefix), assume it's an image
    return `data:image/jpeg;base64,${str}`;
  }

  // For regular JSON strings, use the standard decoding
  return decodeURIComponent(
    Array.prototype.map.call(atob(str), (c) =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join('')
  );
}

export class OfflineError extends Error {}
export class OfflineSuccess extends Error {}

export class OfflineService {
  private static instance: OfflineService;
  private isOnline: boolean = navigator.onLine;
  private pendingUploads: PendingUpload[] = [];
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private networkListener: any = null; // Store the network listener reference
  private isInitialized: boolean = false; // Track initialization state
  private fileStorageService: FileStorageService = FileStorageService.getInstance();

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

    // Initialize the file storage service
    await this.fileStorageService.initialize();

    // Create empty pending uploads file if it doesn't exist
    const fileRef = Capacitor.isNativePlatform() ? 'file:pending_uploads_json' : 'idb:pending_uploads_json';
    try {
      await this.fileStorageService.loadFile(fileRef);
    } catch (e) {
      console.log('[OfflineService] Creating initial empty pending uploads file');
      this.pendingUploads = [];
      await this.savePendingUploads();
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
        // Only process if this is a real state change
        if (status.connected !== this.isOnline) {
          console.log(`[OfflineService] Network status changed - Connected: ${status.connected}, Online: ${this.isOnline}, Type: ${status.connectionType}, Time: ${new Date().toISOString()}`);
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

    // Cleanup FileStorageService
    await this.fileStorageService.cleanup();

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

    try {
      const base64Data = upload.tempImage.base64Data;

      // Use FileStorageService to save the file
      const fileReference = await this.fileStorageService.saveFile(id, base64Data);

      // Create a copy to avoid modifying the original pendingUploads array directly
      const strippedUpload = { ...upload };
      strippedUpload.tempImage = { ...strippedUpload.tempImage, base64Data: fileReference };

      return strippedUpload;
    } catch (error) {
      console.error('[OfflineService] Error stripping image from pending upload:', error);
      throw error;
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

  private async savePendingUploads(): Promise<void> {
    try {
      console.log('[OfflineService] Saving pending uploads:', this.pendingUploads.length);
      const data = JSON.stringify(this.pendingUploads);

      // Use our helper function to properly encode the JSON string
      const base64Data = utf8ToBase64(data);
      const encodedData = `data:application/json;base64,${base64Data}`;
      await this.fileStorageService.saveFile('pending_uploads_json', encodedData);
      console.log('[OfflineService] Successfully saved pending uploads');
    } catch (error) {
      console.error('[OfflineService] Error saving pending uploads:', error);
    }
  }

  private async loadPendingUploads(): Promise<void> {
    try {
      console.log('[OfflineService] Loading pending uploads');

      // Use FileStorageService to load the JSON data
      const fileRef = Capacitor.isNativePlatform() ? 'file:pending_uploads_json' : 'idb:pending_uploads_json';
      const fileData = await this.fileStorageService.loadFile(fileRef);

      // Extract the JSON data from the base64 data URI
      const base64Data = fileData.replace('data:application/json;base64,', '');

      // Decode using our helper function
      const jsonString = base64ToUtf8(base64Data);

      this.pendingUploads = JSON.parse(jsonString);
      console.log('[OfflineService] Successfully loaded pending uploads:', this.pendingUploads.length);
    } catch (error) {
      console.error('[OfflineService] Error loading pending uploads:', error);
      this.pendingUploads = [];
    }
  }

  public async removePendingUpload(id: string): Promise<void> {
    const upload = this.pendingUploads.find(upload => upload.id === id);
    if (!upload) return;

    // Clean up any stored files
    if ((upload.type === PendingUploadType.REPLACE_IMAGE ||
         upload.type === PendingUploadType.ADD_TO_EXISTING_SIT ||
         upload.type === PendingUploadType.NEW_SIT) &&
        typeof upload.tempImage.base64Data === 'string' &&
        (upload.tempImage.base64Data.startsWith('file:') || upload.tempImage.base64Data.startsWith('idb:'))) {

      // Delete the file using FileStorageService
      await this.fileStorageService.deleteFile(upload.tempImage.base64Data);
    }

    this.pendingUploads = this.pendingUploads.filter(upload => upload.id !== id);

    // If there are no more pending uploads, clean up the storage file
    if (this.pendingUploads.length === 0) {
      try {
        const fileRef = Capacitor.isNativePlatform() ? 'file:pending_uploads_json' : 'idb:pending_uploads_json';
        await this.fileStorageService.deleteFile(fileRef);
        console.log('[OfflineService] Removed pending uploads storage file');
      } catch (e) {
        // It's ok if this fails - the file might not exist
        console.log('[OfflineService] No pending uploads storage file to remove');
      }
    } else {
      // Otherwise save the updated list
      await this.savePendingUploads();
    }
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
        typeof upload.tempImage.base64Data === 'string' &&
        (upload.tempImage.base64Data.startsWith('file:') || upload.tempImage.base64Data.startsWith('idb:'))) {

      try {
        // Load the file using FileStorageService
        const base64Data = await this.fileStorageService.loadFile(upload.tempImage.base64Data);

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