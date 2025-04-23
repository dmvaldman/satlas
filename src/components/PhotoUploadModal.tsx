import React from 'react';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { FilePicker, PickedFile } from '@capawesome/capacitor-file-picker';
import { Location, PhotoResult } from '../types';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { OfflineService } from '../services/OfflineService';
import { LocationService } from '../services/LocationService';
import { convertDMSToDD } from '../utils/geo';
import BaseModal from './BaseModal';

// Import the worker script using Vite's ?worker syntax from its new location
import ResizeWorker from '../workers/resize.worker.js?worker';

// Helper function to check for mobile browser user agent
const isMobileBrowser = (): boolean => {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
  return false;
};

interface PhotoUploadProps {
  isOpen: boolean;
  sitId?: string;
  replacementImageId?: string;
  onClose: () => void;
  onPhotoUpload: (result: PhotoResult) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

interface PhotoUploadState {
  processingSource: 'camera' | 'gallery' | null;
}

class PhotoUploadComponent extends React.Component<PhotoUploadProps, PhotoUploadState> {
  private maxDimension = 1600;
  private quality = 90;
  // Initialize worker directly if supported, otherwise null
  private resizeWorker: Worker | null = window.Worker ? new ResizeWorker() : null;
  // Update Map type to expect ImageBitmap back from worker
  private resizePromises = new Map<string, { resolve: (value: ImageBitmap) => void, reject: (reason?: any) => void }>();

  constructor(props: PhotoUploadProps) {
    super(props);
    this.state = {
      processingSource: null
    };
    // Setup listeners if worker was initialized successfully
    if (this.resizeWorker) {
      console.log('[PhotoUpload] Initializing Resize Worker listeners...');
      // UPDATED: Expect imageBitmapResult back
      this.resizeWorker.onmessage = (event) => {
        const { success, imageBitmapResult, error, id } = event.data;
        console.log('[PhotoUpload] Received message from worker for job:', id);
        const promiseCallbacks = this.resizePromises.get(id);
        if (promiseCallbacks) {
            if (success && imageBitmapResult instanceof ImageBitmap) {
                promiseCallbacks.resolve(imageBitmapResult);
            } else {
                promiseCallbacks.reject(new Error(error || 'Worker resizing failed or returned invalid data'));
            }
            this.resizePromises.delete(id); // Clean up
        } else {
            console.warn('[PhotoUpload] Received worker message for unknown job ID:', id);
        }
      };
      this.resizeWorker.onerror = (error) => {
        console.error('[PhotoUpload] Error in Resize Worker:', error);
        // Reject any pending promises on worker error
        this.resizePromises.forEach((callbacks, id) => {
            callbacks.reject(new Error('Worker encountered an error'));
            this.resizePromises.delete(id);
        });
      };
    } else {
        console.warn('[PhotoUpload] Web Workers not supported or failed to initialize.');
    }
  }

  componentWillUnmount() {
    if (this.resizeWorker) {
      console.log('[PhotoUpload] Terminating Resize Worker.');
      this.resizeWorker.terminate();
      // Reject any pending promises on unmount
      this.resizePromises.forEach((callbacks, id) => {
           callbacks.reject(new Error('Component unmounting'));
           this.resizePromises.delete(id);
      });
    }
  }

  private async getLocation(sourceType: 'camera' | 'gallery', originalBase64?: string): Promise<Location> {
      if (sourceType === 'camera') {
          console.log('[PhotoUpload] Getting device location for camera photo...');
          return LocationService.getLastKnownLocation() || new LocationService().getCurrentLocation();
      }
      // For gallery, attempt EXIF first (Only possible with Base64)
      if (originalBase64) {
          try {
              console.log('[PhotoUpload] Attempting to get EXIF location from original gallery image data...');
              return await this.getImageLocation(originalBase64);
          } catch (exifError) {
              console.warn('[PhotoUpload] Could not get EXIF location:', exifError);
              throw new Error('Could not get location from photo');
          }
      } else {
           console.warn('[PhotoUpload] No original Base64 provided to getLocation for gallery image.');
           throw new Error('Could not get location from photo');
      }
  }

  private async getImageLocation(base64Image: string): Promise<Location> {
    console.log('[PhotoUpload] Starting EXIF extraction from image');

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${base64Image}`;

      img.onload = () => {
        try {
          console.log('[PhotoUpload] Image loaded, dimensions:', img.width, 'x', img.height);

          // @ts-ignore - EXIF is loaded globally (via a script tag in index.html)
          EXIF.getData(img, function() {
            // @ts-ignore
            const exifData = EXIF.getAllTags(this);
            console.log('[PhotoUpload] Raw EXIF data:', exifData);

            // Debug GPS info specifically
            console.log('[PhotoUpload] GPS data in EXIF:', {
              hasGPSLatitude: !!exifData?.GPSLatitude,
              hasGPSLongitude: !!exifData?.GPSLongitude,
              latRef: exifData?.GPSLatitudeRef,
              longRef: exifData?.GPSLongitudeRef,
              latValues: exifData?.GPSLatitude,
              longValues: exifData?.GPSLongitude
            });

            if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
              const latitude = convertDMSToDD(
                exifData.GPSLatitude,
                exifData.GPSLatitudeRef
              );
              const longitude = convertDMSToDD(
                exifData.GPSLongitude,
                exifData.GPSLongitudeRef
              );

              console.log('[PhotoUpload] Converted coordinates:', { latitude, longitude });

              if (
                !isNaN(latitude) &&
                !isNaN(longitude) &&
                latitude >= -90 &&
                latitude <= 90 &&
                longitude >= -180 &&
                longitude <= 180
              ) {
                resolve({ latitude, longitude });
                return;
              } else {
                console.error('[PhotoUpload] Invalid coordinates:', { latitude, longitude });
                reject(new Error('Invalid coordinates'));
              }
            } else {
              console.error('[PhotoUpload] No GPS data in EXIF');
              reject(new Error('No GPS data in EXIF'));
            }
          });
        } catch (error) {
          console.error('[PhotoUpload] Error reading EXIF:', error);
          reject(error);
        }
      };
    });
  }

  // UPDATED: getImageDimensions to use ImageBitmap
  private getImageDimensions = (imageBitmap: ImageBitmap): {width: number, height: number} => {
    if (imageBitmap.width > 0 && imageBitmap.height > 0) {
      return { width: imageBitmap.width, height: imageBitmap.height };
    } else {
      throw new Error('Invalid image dimensions from ImageBitmap: width or height is zero');
    }
  };

  // ADDED: Helper to convert Base64 string to ArrayBuffer
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64.replace(/^data:image\/\w+;base64,/, '')); // Ensure prefix is removed
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // UPDATED: resizeImageUnified to accept ArrayBuffer and return Promise<ImageBitmap>
  private resizeImageUnified(imageBuffer: ArrayBuffer): Promise<ImageBitmap> {
    if (!this.resizeWorker) {
        console.error('[PhotoUpload] Resize worker not available!');
        return Promise.reject(new Error("Resize worker not available."));
    }

    return new Promise<ImageBitmap>((resolve, reject) => {
        const jobId = `job_${Date.now()}_${Math.random()}`;
        this.resizePromises.set(jobId, { resolve, reject });
        // UPDATED: Post ArrayBuffer and mark it as transferable
        this.resizeWorker?.postMessage({
            imageBuffer: imageBuffer, // Pass buffer
            maxDimension: this.maxDimension,
            quality: this.quality,
            id: jobId
        }, [imageBuffer]); // <-- Transfer ownership

        // Optional: Add a timeout for the promise
        const timeoutId = setTimeout(() => {
            if (this.resizePromises.has(jobId)) {
                console.error(`[PhotoUpload] Worker job ${jobId} timed out.`);
                this.resizePromises.get(jobId)?.reject(new Error('Resize operation timed out'));
                this.resizePromises.delete(jobId);
            }
        }, 30000);

        // Ensure timeout is cleared when promise settles
        const promiseCallbacks = this.resizePromises.get(jobId);
        if (promiseCallbacks) {
            // Update resolve/reject types here too for clarity
            promiseCallbacks.resolve = (value: ImageBitmap) => {
                clearTimeout(timeoutId);
                resolve(value);
            };
            promiseCallbacks.reject = (reason?: any) => {
                clearTimeout(timeoutId);
                reject(reason);
            };
        } else {
            console.error(`[PhotoUpload] Could not find promise callbacks for job ${jobId} immediately after creation.`);
            clearTimeout(timeoutId); // Clear timeout anyway
            reject(new Error(`Internal error processing job ${jobId}`));
        }
    });
  }

  // ADDED: Helper to convert Blob back to Base64 (for PhotoResult)
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
            resolve(reader.result.toString().split(',')[1]); // Remove prefix
        } else {
            reject(new Error('FileReader did not return result for final conversion.'));
        }
      };
      reader.onerror = (error) => {
          console.error('[PhotoUpload] Final blobToBase64 conversion error:', error);
          reject(error);
      }
      reader.readAsDataURL(blob);
    });
  }

  // ADDED: Helper to convert ImageBitmap to Blob
  private async imageBitmapToBlob(bitmap: ImageBitmap, quality: number): Promise<Blob> {
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    if (typeof OffscreenCanvas === 'undefined') {
        console.warn('[PhotoUpload] OffscreenCanvas not available in main thread for Blob conversion, using regular canvas.');
        canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
    } else {
        canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context for Blob conversion');

    // Explicitly check type for HTMLCanvasElement fallback
    if (canvas instanceof HTMLCanvasElement) {
        const htmlCtx = ctx as CanvasRenderingContext2D; // Cast here
        htmlCtx.drawImage(bitmap, 0, 0);
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) { resolve(blob); } else { reject(new Error('canvas.toBlob failed')); }
            }, 'image/jpeg', quality / 100);
        });
    } else {
        // Assumed OffscreenCanvas path
        const offscreenCtx = ctx as OffscreenCanvasRenderingContext2D; // Cast here
        offscreenCtx.drawImage(bitmap, 0, 0);
        return await canvas.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
    }
  }

  // UPDATED: processImage to use ArrayBuffer and ImageBitmap flow
  private async processImage(imageSource: string, sourceType: 'camera' | 'gallery') {
      console.log(`[PhotoUpload] Starting processing pipeline for ${sourceType}...`);
      if (!this.resizeWorker) {
          this.props.showNotification('Image processing service unavailable.', 'error');
          return;
      }
      let originalImageBuffer: ArrayBuffer;
      let finalResizedBitmap: ImageBitmap;
      let finalBase64Data: string; // Still need this for PhotoResult temporarily
      let location: Location | null;
      let dimensions: { width: number; height: number };
      let originalBase64ForExif: string | undefined;

      try {
          // 1. Get ORIGINAL data as ArrayBuffer AND Base64 (for EXIF)
          if (Capacitor.getPlatform() !== 'web' && imageSource.startsWith('file:')) {
              const fileContent = await Filesystem.readFile({ path: imageSource });
              if (typeof fileContent.data !== 'string') {
                  throw new Error('Filesystem did not return Base64 string.');
              }
              originalBase64ForExif = fileContent.data;
              originalImageBuffer = this.base64ToArrayBuffer(originalBase64ForExif);
          } else {
              originalBase64ForExif = imageSource;
              originalImageBuffer = this.base64ToArrayBuffer(originalBase64ForExif);
          }

          // 2. Resize/Optimize Image using the Worker (pass TRANSFERABLE ArrayBuffer, get ImageBitmap)
          finalResizedBitmap = await this.resizeImageUnified(originalImageBuffer);

          // 3. Get Location (using ORIGINAL base64 if needed for EXIF)
          try {
            location = await this.getLocation(sourceType, originalBase64ForExif);
          } catch (error) {
            console.error('[PhotoUpload] Error getting location:', error);
            this.props.showNotification('Error getting location from photo', 'error');
          }

          // 4. Get Dimensions (directly from the FINAL processed ImageBitmap)
          try {
            dimensions = this.getImageDimensions(finalResizedBitmap);
          } catch (error) {
            console.error('[PhotoUpload] Error getting image dimensions:', error);
            this.props.showNotification('Error getting image dimensions', 'error');
          }

          // 5. Convert final ImageBitmap to Blob
          const finalResizedBlob = await this.imageBitmapToBlob(finalResizedBitmap, this.quality);

          // Close the bitmap now that we have the Blob
          finalResizedBitmap.close();

          // !! TEMPORARY STEP for Phase 1: Convert Blob back to Base64 for downstream PhotoResult !!
          console.log('[PhotoUpload] Converting final Blob back to Base64 for PhotoResult...');
          finalBase64Data = await this.blobToBase64(finalResizedBlob);
          console.log('[PhotoUpload] Final Base64 conversion complete.');
          // !! END TEMPORARY STEP !!

          // 6. Prepare and Upload Result (using the temporary Base64)
          const photoResult: PhotoResult = {
              base64Data: finalBase64Data,
              location,
              dimensions
          };
          console.log('[PhotoUpload] Processing complete, calling onPhotoUpload.');
          this.props.onPhotoUpload(photoResult);

      } catch (error) {
          console.error(`[PhotoUpload] Error during image processing pipeline (${sourceType}):`, error);
          const message = error instanceof Error ? error.message : 'Error processing image';
          this.props.showNotification(message, 'error');
      }
  }

  private handleTakePhoto = async () => {
    // Delay the state update to allow the camera to open
    setTimeout(() => {
      this.setState({ processingSource: 'camera' });
    }, 400);

    let originalPath: string | null = null;
    try {
      console.log('[PhotoUpload] Starting camera capture (requesting URI)');
      const image: Photo = await Camera.getPhoto({
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });
      console.log('[PhotoUpload] Photo captured (URI): ', image.webPath, '|| Native Path:', image.path);
      // Use the native path if available, otherwise fallback to webPath (though path is expected for native)
      const nativePath = image.path || image.webPath;
      if (!nativePath) throw new Error('No image path received from camera');
      originalPath = nativePath;

      await this.processImage(originalPath, 'camera');

    } catch (error) {
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('cancel') || errorMessage.includes('denied') || errorMessage.includes('permission')) {
          console.log('[PhotoUpload] Camera operation cancelled or denied.');
          return;
        }
      }
      console.error('[PhotoUpload] Error acquiring camera image:', error);
      this.props.showNotification('Error accessing camera', 'error');
    }
    finally {
      this.setState({ processingSource: null });
    }
  };

  private handleChooseFromGallery = async () => {
    let originalPathOrBase64: string | null = null;
    try {
      console.log('[PhotoUpload] Starting gallery selection');
      if (Capacitor.getPlatform() === 'web') {
        // Don't set processing on web
        // this.setState({ processingSource: 'gallery' });
        originalPathOrBase64 = await this.getImageFromWebFileInput();
      } else {
        setTimeout(() => {
          this.setState({ processingSource: 'gallery' });
        }, 400);
        originalPathOrBase64 = await this.getImagePathFromNativeGallery();
      }
      if (!originalPathOrBase64) return;
      console.log('[PhotoUpload] Original image acquired from gallery.');

      await this.processImage(originalPathOrBase64, 'gallery');

    } catch (error) {
      if (error instanceof Error && (error.message.includes('cancel') || error.message.includes('No image selected'))) {
        console.log('[PhotoUpload] Gallery selection cancelled.');
        return;
      }
      console.error('[PhotoUpload] Error acquiring gallery image:', error);
      this.props.showNotification('Error accessing photos', 'error');
    }
    finally {
      this.setState({ processingSource: null });
    }
  };

  private getImageFromWebFileInput = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        try {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            console.log('Photo selection cancelled');
            resolve('');
            return;
          }

          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const initialBase64WithPrefix = e.target?.result as string;
              if (!initialBase64WithPrefix) {
                  throw new Error('FileReader did not return result');
              }
              const initialBase64 = initialBase64WithPrefix.split(',')[1];

              resolve(initialBase64);

            } catch (error) {
                 console.error('[PhotoUpload] Error processing file reader result:', error);
                 reject(error);
            }
          };
          reader.onerror = (error) => {
            console.error('[PhotoUpload] FileReader error:', error);
            reject(new Error('Failed to read file'));
          };
          reader.readAsDataURL(file);
        } catch (error) {
          reject(error);
        }
      };

      input.click();
    });
  };

  private getImagePathFromNativeGallery = async (): Promise<string | null> => {
    try {
      if (Capacitor.getPlatform() === 'android') {
        const result = await FilePicker.pickImages({
          limit: 1,
          readData: false
        });
        if (!result.files || result.files.length === 0 || !result.files[0].path) {
          console.log('[PhotoUpload] No image path selected from Android gallery.');
          return null;
        }
        return result.files[0].path;

      } else if (Capacitor.getPlatform() === 'ios') {
        const image = await Camera.getPhoto({
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Photos
        });
        const nativePath = image.path || image.webPath;
        if (!nativePath) {
            console.log('[PhotoUpload] No image path selected from iOS gallery.');
            return null;
        }
        return nativePath;
      } else {
        throw new Error('Unsupported native platform');
      }
    } catch (error) {
        console.error('[PhotoUpload] Error getting image path from native gallery:', error);
        if (error instanceof Error && (error.message.includes('cancel') || error.message.includes('No image selected'))) {
            console.log('[PhotoUpload] Native gallery selection cancelled.');
            return null;
        }
        throw error;
    }
  };

  render() {
    const { isOpen, onClose } = this.props;
    const isOffline = !OfflineService.getInstance().isNetworkOnline();
    const { processingSource } = this.state;
    const platform = Capacitor.getPlatform();

    return (
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
      >
        {isOffline && (
          <div className="offline-notice">You're offline. Photos will upload when you're back online.</div>
        )}

        <button
          className="modal-option-button"
          onClick={this.handleTakePhoto}
          disabled={(platform === 'web' && !isMobileBrowser())}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
            <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
          </svg>
          Take Photo
          {processingSource === 'camera' && <div className="spinner xsmall"></div>}
        </button>

        <button
          className="modal-option-button"
          onClick={this.handleChooseFromGallery}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          Choose from Gallery
          {processingSource === 'gallery' && <div className="spinner xsmall"></div>}
        </button>
      </BaseModal>
    );
  }
}

export default PhotoUploadComponent;