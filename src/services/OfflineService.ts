import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { PhotoResult } from '../types';
import { ValidationUtils } from '../utils/ValidationUtils';

// Define explicit types for different kinds of pending uploads
export enum PendingUploadType {
  NEW_SIT = 'NEW_SIT',
  ADD_TO_EXISTING_SIT = 'ADD_TO_EXISTING_SIT',
  REPLACE_IMAGE = 'REPLACE_IMAGE'
}

// Base interface for all pending uploads
interface BasePendingUpload {
  id: string;
  type: PendingUploadType;
  photoResult: PhotoResult;
  timestamp: number;
  userId: string;
  userName: string;
}

// New sit upload
export interface NewSitPendingUpload extends BasePendingUpload {
  type: PendingUploadType.NEW_SIT;
  // New sit only needs the photo result with location
}

// Add photo to existing sit
export interface AddToSitPendingUpload extends BasePendingUpload {
  type: PendingUploadType.ADD_TO_EXISTING_SIT;
  photoResult: PhotoResult;
  imageCollectionId: string;
}

// Replace existing image
export interface ReplaceImagePendingUpload extends BasePendingUpload {
  type: PendingUploadType.REPLACE_IMAGE;
  photoResult: PhotoResult;
  imageCollectionId: string;
  imageId: string;
}

// Union type for all pending upload types
export type PendingUpload = NewSitPendingUpload | AddToSitPendingUpload | ReplaceImagePendingUpload;

export class OfflineService {
  private static instance: OfflineService;
  private isOnline: boolean = navigator.onLine;
  private pendingUploads: PendingUpload[] = [];
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private queueListeners: Set<(queue: PendingUpload[]) => void> = new Set();
  private initialized: boolean = false;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): OfflineService {
    if (!OfflineService.instance) {
      OfflineService.instance = new OfflineService();
    }
    return OfflineService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load any saved pending uploads
    await this.loadPendingUploads();

    // Set up network status listeners
    if (Capacitor.isNativePlatform()) {
      // Use Capacitor Network plugin for native platforms
      const status = await Network.getStatus();
      this.isOnline = status.connected;

      Network.addListener('networkStatusChange', (status) => {
        const wasOffline = !this.isOnline;
        this.isOnline = status.connected;

        // Notify listeners of status change
        this.notifyListeners();

        // If we just came back online, process the queue
        if (wasOffline && this.isOnline) {
          this.processPendingUploads();
        }
      });
    } else {
      // Use browser events for web
      this.isOnline = navigator.onLine;

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notifyListeners();
        this.processPendingUploads();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyListeners();
      });
    }

    this.initialized = true;
  }

  public isNetworkOnline(): boolean {
    return this.isOnline;
  }

  public addStatusListener(listener: (isOnline: boolean) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with current status
    listener(this.isOnline);

    // Return function to remove listener
    return () => {
      this.listeners.delete(listener);
    };
  }

  public addQueueListener(listener: (queue: PendingUpload[]) => void): () => void {
    this.queueListeners.add(listener);
    // Immediately notify with current queue
    listener([...this.pendingUploads]);

    // Return function to remove listener
    return () => {
      this.queueListeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.isOnline));
  }

  private notifyQueueListeners(): void {
    this.queueListeners.forEach(listener => listener([...this.pendingUploads]));
  }

  // Add a new sit with photo
  public async addPendingNewSit(
    photoResult: PhotoResult,
    userId: string,
    userName: string
  ): Promise<string> {
    const id = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const pendingUpload: NewSitPendingUpload = {
      id,
      type: PendingUploadType.NEW_SIT,
      photoResult,
      userId,
      userName,
      timestamp: Date.now()
    };

    // Save the image data to filesystem if on native platform
    if (Capacitor.isNativePlatform()) {
      await this.saveImageToFileSystem(id, photoResult.base64Data);

      // Replace the base64 data with a reference to save memory
      const savedPhotoResult = { ...photoResult };
      // @ts-ignore - we're intentionally replacing the data with a reference
      savedPhotoResult.base64Data = `file:${id}`;
      pendingUpload.photoResult = savedPhotoResult;
    }

    this.pendingUploads.push(pendingUpload);
    await this.savePendingUploads();
    this.notifyQueueListeners();

    return id;
  }

  // Add a photo to an existing sit
  public async addPendingPhotoToSit(
    photoResult: PhotoResult,
    imageCollectionId: string,
    userId: string,
    userName: string
  ): Promise<string> {
    // Client-side validation using ValidationUtils directly
    if (!ValidationUtils.canUserAddPhotoToSit(imageCollectionId, userId, false)) {
      throw new Error("You've already added a photo to this sit");
    }

    const id = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const pendingUpload: AddToSitPendingUpload = {
      id,
      type: PendingUploadType.ADD_TO_EXISTING_SIT,
      photoResult,
      imageCollectionId,
      userId,
      userName,
      timestamp: Date.now()
    };

    // Save the image data to filesystem if on native platform
    if (Capacitor.isNativePlatform()) {
      await this.saveImageToFileSystem(id, photoResult.base64Data);

      // Replace the base64 data with a reference to save memory
      const savedPhotoResult = { ...photoResult };
      // @ts-ignore - we're intentionally replacing the data with a reference
      savedPhotoResult.base64Data = `file:${id}`;
      pendingUpload.photoResult = savedPhotoResult;
    }

    this.pendingUploads.push(pendingUpload);
    await this.savePendingUploads();
    this.notifyQueueListeners();

    return id;
  }

  // Replace an existing image
  public async addPendingReplaceImage(
    photoResult: PhotoResult,
    imageCollectionId: string,
    imageId: string,
    userId: string,
    userName: string
  ): Promise<string> {
    // Client-side validation using ValidationUtils directly
    if (!ValidationUtils.canUserReplaceImage(imageId, userId, false)) {
      throw new Error("You can only replace your own images");
    }

    const id = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const pendingUpload: ReplaceImagePendingUpload = {
      id,
      type: PendingUploadType.REPLACE_IMAGE,
      photoResult,
      imageCollectionId,
      imageId,
      userId,
      userName,
      timestamp: Date.now()
    };

    // Save the image data to filesystem if on native platform
    if (Capacitor.isNativePlatform()) {
      await this.saveImageToFileSystem(id, photoResult.base64Data);

      // Replace the base64 data with a reference to save memory
      const savedPhotoResult = { ...photoResult };
      // @ts-ignore - we're intentionally replacing the data with a reference
      savedPhotoResult.base64Data = `file:${id}`;
      pendingUpload.photoResult = savedPhotoResult;
    }

    this.pendingUploads.push(pendingUpload);
    await this.savePendingUploads();
    this.notifyQueueListeners();

    return id;
  }

  private async saveImageToFileSystem(id: string, base64Data: string): Promise<void> {
    try {
      // Ensure the base64 data doesn't have the prefix
      const data = base64Data.replace(/^data:image\/\w+;base64,/, '');

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
        data,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });
    } catch (error) {
      console.error('Error saving image to filesystem:', error);
      throw error;
    }
  }

  private async getImageFromFileSystem(id: string): Promise<string> {
    try {
      const result = await Filesystem.readFile({
        path: `offline_uploads/${id}.jpg`,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });

      // Add the data URL prefix back
      return `data:image/jpeg;base64,${result.data}`;
    } catch (error) {
      console.error('Error reading image from filesystem:', error);
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

  private async savePendingUploads(): Promise<void> {
    try {
      const data = JSON.stringify(this.pendingUploads);

      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: 'pending_uploads.json',
          data,
          directory: Directory.Cache,
          encoding: Encoding.UTF8
        });
      } else {
        localStorage.setItem('pendingUploads', data);
      }
    } catch (error) {
      console.error('Error saving pending uploads:', error);
    }
  }

  private async loadPendingUploads(): Promise<void> {
    try {
      let data: string | null = null;

      if (Capacitor.isNativePlatform()) {
        try {
          const result = await Filesystem.readFile({
            path: 'pending_uploads.json',
            directory: Directory.Cache,
            encoding: Encoding.UTF8
          });
          data = result.data as string;
        } catch (e) {
          // File might not exist yet, that's ok
          data = null;
        }
      } else {
        data = localStorage.getItem('pendingUploads');
      }

      if (data) {
        this.pendingUploads = JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading pending uploads:', error);
      this.pendingUploads = [];
    }
  }

  public async processPendingUploads(): Promise<void> {
    if (!this.isOnline || this.pendingUploads.length === 0) return;

    // This method is now implemented in the App component
    // We just notify listeners that the queue is ready to be processed
    console.log('[OfflineService] Network is online, ready to process pending uploads');
    this.notifyQueueListeners();
  }

  public async removePendingUpload(id: string): Promise<void> {
    const upload = this.pendingUploads.find(upload => upload.id === id);
    if (!upload) return;

    // If the image was saved to the filesystem, delete it
    if (Capacitor.isNativePlatform() && typeof upload.photoResult.base64Data === 'string' &&
        upload.photoResult.base64Data.startsWith('file:')) {
      const fileId = upload.photoResult.base64Data.substring(5);
      await this.deleteImageFromFileSystem(fileId);
    }

    this.pendingUploads = this.pendingUploads.filter(upload => upload.id !== id);
    await this.savePendingUploads();
    this.notifyQueueListeners();
  }

  public getPendingUploads(): PendingUpload[] {
    return [...this.pendingUploads];
  }

  public async getFullPendingUpload(id: string): Promise<PendingUpload | null> {
    const upload = this.pendingUploads.find(upload => upload.id === id);
    if (!upload) return null;

    // If we're on a native platform and the image is a file reference, load it
    if (Capacitor.isNativePlatform() &&
        typeof upload.photoResult.base64Data === 'string' &&
        upload.photoResult.base64Data.startsWith('file:')) {

      const fileId = upload.photoResult.base64Data.substring(5);
      const base64Data = await this.getImageFromFileSystem(fileId);

      return {
        ...upload,
        photoResult: {
          ...upload.photoResult,
          base64Data
        }
      };
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

  // Get count of pending uploads by type
  public getPendingUploadCounts(): { [key in PendingUploadType]: number } {
    const counts = {
      [PendingUploadType.NEW_SIT]: 0,
      [PendingUploadType.ADD_TO_EXISTING_SIT]: 0,
      [PendingUploadType.REPLACE_IMAGE]: 0
    };

    this.pendingUploads.forEach(upload => {
      counts[upload.type]++;
    });

    return counts;
  }

  /**
   * Check if there are pending uploads and we're online
   * @returns true if there are pending uploads that can be processed
   */
  public hasPendingUploadsToProcess(): boolean {
    return this.isOnline && this.pendingUploads.length > 0;
  }
}

export default OfflineService;