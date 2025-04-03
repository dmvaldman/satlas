import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Define the schema for our IndexedDB
interface FileStorageDB extends DBSchema {
  files: {
    key: string;
    value: {
      id: string;
      data: string;
      timestamp: number;
    };
  };
}

/**
 * FileStorageService handles file storage operations across different platforms
 * For native platforms, it uses Capacitor's Filesystem API
 * For web, it uses IndexedDB
 */
export class FileStorageService {
  private static instance: FileStorageService;
  private db: IDBPDatabase<FileStorageDB> | null = null;
  private isInitialized: boolean = false;

  /**
   * Get the singleton instance of FileStorageService
   */
  public static getInstance(): FileStorageService {
    if (!FileStorageService.instance) {
      FileStorageService.instance = new FileStorageService();
    }
    return FileStorageService.instance;
  }

  /**
   * Initialize the service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[FileStorageService] Already initialized, skipping');
      return;
    }

    console.log('[FileStorageService] Initializing...');

    if (!Capacitor.isNativePlatform()) {
      try {
        this.db = await openDB<FileStorageDB>('file-storage-db', 1, {
          upgrade(db) {
            if (!db.objectStoreNames.contains('files')) {
              db.createObjectStore('files', { keyPath: 'id' });
              console.log('[FileStorageService] Created IndexedDB store for files');
            }
          },
        });
        console.log('[FileStorageService] IndexedDB initialized successfully');
      } catch (error) {
        console.error('[FileStorageService] Error initializing IndexedDB:', error);
        this.db = null;
      }
    } else {
      // For native platforms, ensure the required directory exists
      try {
        await Filesystem.mkdir({
          path: 'offline_uploads',
          directory: Directory.Cache,
          recursive: true
        });
        console.log('[FileStorageService] Created offline_uploads directory');
      } catch (e) {
        // Directory might already exist, that's fine
        console.log('[FileStorageService] offline_uploads directory might already exist');
      }
    }

    this.isInitialized = true;
    console.log('[FileStorageService] Initialization complete');
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    console.log('[FileStorageService] Cleaning up...');

    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[FileStorageService] Closed IndexedDB connection');
    }

    this.isInitialized = false;
    console.log('[FileStorageService] Cleanup complete');
  }

  /**
   * Save a file
   * @param id Unique ID for the file
   * @param data File data as base64 string
   * @returns Reference to the saved file
   */
  public async saveFile(id: string, data: string): Promise<string> {
    try {
      await this.ensureInitialized();

      // Clean the data if needed
      const cleanData = data.replace(/^data:image\/\w+;base64,/, '').trim();

      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: `offline_uploads/${id}.jpg`,
          data: cleanData,
          directory: Directory.Cache,
          encoding: Encoding.UTF8
        });
        console.log('[FileStorageService] Saved file to filesystem:', id);
        return `file:${id}`;
      } else {
        if (!this.db) {
          throw new Error('IndexedDB not initialized');
        }

        await this.db.put('files', {
          id,
          data,
          timestamp: Date.now()
        });
        console.log('[FileStorageService] Saved file to IndexedDB:', id);
        return `idb:${id}`;
      }
    } catch (error) {
      console.error('[FileStorageService] Error saving file:', error);
      throw error;
    }
  }

  /**
   * Load a file
   * @param reference File reference (returned from saveFile)
   * @returns File data as string
   */
  public async loadFile(reference: string): Promise<string> {
    try {
      await this.ensureInitialized();

      if (reference.startsWith('file:')) {
        const id = reference.substring(5);
        return this.loadFileFromFileSystem(id);
      } else if (reference.startsWith('idb:')) {
        const id = reference.substring(4);
        return this.loadFileFromIndexedDB(id);
      } else {
        throw new Error(`Invalid file reference: ${reference}`);
      }
    } catch (error) {
      console.error('[FileStorageService] Error loading file:', error);
      throw error;
    }
  }

  /**
   * Delete a file
   * @param reference File reference (returned from saveFile)
   */
  public async deleteFile(reference: string): Promise<void> {
    try {
      await this.ensureInitialized();

      if (reference.startsWith('file:')) {
        const id = reference.substring(5);
        await this.deleteFileFromFileSystem(id);
      } else if (reference.startsWith('idb:')) {
        const id = reference.substring(4);
        await this.deleteFileFromIndexedDB(id);
      } else {
        console.warn(`[FileStorageService] Invalid file reference: ${reference}, skipping deletion`);
      }
    } catch (error) {
      console.error('[FileStorageService] Error deleting file:', error);
      // Don't throw, just log the error
    }
  }

  /**
   * Ensure the service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Load a file from the filesystem (native platforms)
   */
  private async loadFileFromFileSystem(id: string): Promise<string> {
    try {
      console.log('[FileStorageService] Reading file from filesystem:', id);
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
      console.error('[FileStorageService] Error reading file from filesystem:', error);
      throw error;
    }
  }

  /**
   * Delete a file from the filesystem (native platforms)
   */
  private async deleteFileFromFileSystem(id: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `offline_uploads/${id}.jpg`,
        directory: Directory.Cache
      });
      console.log('[FileStorageService] Deleted file from filesystem:', id);
    } catch (error) {
      console.error('[FileStorageService] Error deleting file from filesystem:', error);
      // Don't throw, just log the error
    }
  }

  /**
   * Load a file from IndexedDB (web platforms)
   */
  private async loadFileFromIndexedDB(id: string): Promise<string> {
    try {
      if (!this.db) {
        throw new Error('IndexedDB not initialized');
      }

      console.log('[FileStorageService] Reading file from IndexedDB:', id);
      const file = await this.db.get('files', id);

      if (!file) {
        throw new Error(`File with ID ${id} not found in IndexedDB`);
      }

      return file.data;
    } catch (error) {
      console.error('[FileStorageService] Error reading file from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Delete a file from IndexedDB (web platforms)
   */
  private async deleteFileFromIndexedDB(id: string): Promise<void> {
    try {
      if (!this.db) {
        throw new Error('IndexedDB not initialized');
      }

      await this.db.delete('files', id);
      console.log('[FileStorageService] Deleted file from IndexedDB:', id);
    } catch (error) {
      console.error('[FileStorageService] Error deleting file from IndexedDB:', error);
      // Don't throw, just log the error
    }
  }
}

export default FileStorageService;