import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

export class StorageService {
  // Cache images locally
  static async cacheImage(imageUrl: string, imageName: string): Promise<string> {
    if (Capacitor.getPlatform() === 'web') {
      return imageUrl; // Just return URL on web
    }

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]);
        };
        reader.onerror = reject;
      });

      const savedFile = await Filesystem.writeFile({
        path: `satlas_images/${imageName}`,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true
      });

      return savedFile.uri;
    } catch (error) {
      console.error('Error caching image:', error);
      return imageUrl; // Fall back to original URL
    }
  }

  // Read cached image
  static async readCachedImage(imageName: string): Promise<string | null> {
    try {
      const file = await Filesystem.readFile({
        path: `satlas_images/${imageName}`,
        directory: Directory.Cache
      });

      return `data:image/jpeg;base64,${file.data}`;
    } catch (error) {
      console.error('Error reading cached image:', error);
      return null;
    }
  }

  // Save data to local storage
  static async saveData(key: string, data: any): Promise<void> {
    try {
      await Filesystem.writeFile({
        path: `satlas_data/${key}.json`,
        data: JSON.stringify(data),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true
      });
    } catch (error) {
      console.error('Error saving data:', error);
      // Fallback to localStorage
      localStorage.setItem(key, JSON.stringify(data));
    }
  }

  // Read data from local storage
  static async readData<T>(key: string): Promise<T | null> {
    try {
      const file = await Filesystem.readFile({
        path: `satlas_data/${key}.json`,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });

      if (typeof file.data === 'string') {
        return JSON.parse(file.data) as T;
      } else {
        // Handle Blob data by converting it to string first
        const text = await file.data.text();
        return JSON.parse(text) as T;
      }
    } catch (error) {
      console.error('Error reading data:', error);
      // Fallback to localStorage
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    }
  }
}