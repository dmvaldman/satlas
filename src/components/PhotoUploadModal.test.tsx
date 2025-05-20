// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhotoUploadComponent from './PhotoUploadModal';
import { LocationService } from '../services/LocationService';
import * as CapacitorCamera from '@capacitor/camera';
import * as CapacitorFilesystem from '@capacitor/filesystem';
import { Location, PhotoResult } from '../types'; // Adjust if PhotoResult is not directly used by PhotoUploadModal anymore for this test

// Mock ResizeWorker
vi.mock('../workers/resize.worker.js?worker', () => {
  class MockWorker {
    onmessage: (event: any) => void = () => {};
    onerror: (event: any) => void = () => {};
    postMessage = vi.fn();
    terminate = vi.fn();

    constructor() {
      // Simulate worker sending a message back
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({
            data: {
              success: true,
              imageBitmapResult: new ImageBitmap(), // Mock ImageBitmap
              id: 'job_test_id' // Ensure an ID is passed back
            }
          });
        }
      }, 0);
    }
  }
  return { default: MockWorker };
});

// Mock Capacitor Plugins
vi.mock('@capacitor/camera', async () => {
  const actual = await vi.importActual('@capacitor/camera');
  return {
    ...actual,
    Camera: {
      getPhoto: vi.fn(),
    },
  };
});

vi.mock('@capacitor/filesystem', async () => {
  const actual = await vi.importActual('@capacitor/filesystem');
  return {
    ...actual,
    Filesystem: {
      readFile: vi.fn(),
    },
    Directory: { Cache: 'CACHE' },
    Encoding: { UTF8: 'utf8' },
  };
});

vi.mock('@capawesome/capacitor-file-picker', () => ({
  FilePicker: {
    pickImages: vi.fn(),
  },
}));

// Mock LocationService
vi.mock('../services/LocationService', () => {
  const mockLocation: Location = { latitude: 34.0522, longitude: -118.2437 };
  return {
    LocationService: vi.fn().mockImplementation(() => ({
      getCurrentLocation: vi.fn().mockResolvedValue(mockLocation),
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      onLocationUpdate: vi.fn(),
      offLocationUpdate: vi.fn(),
    })),
    convertDMSToDD: vi.fn((arr, ref) => (ref === 'S' || ref === 'W' ? -arr[0] : arr[0])),
  };
});
LocationService.getLastKnownLocation = vi.fn();


// Mock EXIF.getData (global)
// @ts-ignore
global.EXIF = {
    // @ts-ignore
    getData: vi.fn((img, callback) => callback.call({ GPSLatitude: [34,1,1], GPSLongitude: [118,1,1], GPSLatitudeRef: 'N', GPSLongitudeRef: 'W' })),
    // @ts-ignore
    getAllTags: vi.fn(img => ({ GPSLatitude: [34,1,1], GPSLongitude: [118,1,1], GPSLatitudeRef: 'N', GPSLongitudeRef: 'W' }))
};

// Mock Image.onload and src
Object.defineProperty(global.Image.prototype, 'onload', {
  configurable: true,
  set(onload) {
    this._onload = onload;
    if (this._src && onload) { // If src was already set, trigger onload
      setTimeout(() => onload(), 0);
    }
  },
  get() { return this._onload; }
});
Object.defineProperty(global.Image.prototype, 'src', {
  configurable: true,
  set(src) {
    this._src = src;
    if (src && this.onload) {
      setTimeout(() => this.onload(), 0);
    }
  },
  get() { return this._src; }
});

// Mock OffscreenCanvas and HTMLCanvasElement for imageBitmapToBlob
if (typeof OffscreenCanvas === 'undefined') {
  // @ts-ignore
  global.OffscreenCanvas = class {
    constructor(public width: number, public height: number) {}
    getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
    convertToBlob = vi.fn().mockResolvedValue(new Blob(['mock image data'], { type: 'image/jpeg' }));
  };
}
if (typeof HTMLCanvasElement.prototype.getContext === 'undefined') {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
}
if (typeof HTMLCanvasElement.prototype.toBlob === 'undefined') {
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => callback(new Blob(['mock image data'], { type: 'image/jpeg' })));
}

// Mock ImageBitmap
if (typeof ImageBitmap === 'undefined') {
  // @ts-ignore
  global.ImageBitmap = class { // Use class for new ImageBitmap()
    constructor(public width = 100, public height = 100) {} // Default dimensions
    close = vi.fn();
  };
}

global.URL.createObjectURL = vi.fn(() => 'blob:mockurl');
global.URL.revokeObjectURL = vi.fn();

const mockDefaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onPhotoUpload: vi.fn(),
  showNotification: vi.fn(),
  onMissingLocationData: vi.fn(), // New prop
  // onStartManualLocationEdit is removed
  sitId: undefined,
  replacementImageId: undefined,
};

// Helper to get component instance
const getInstance = (rerender: (ui: React.ReactElement) => void, ComponentType: any, props: any) => {
  let instance: any = null;
  const TestComponent = React.forwardRef((props, ref) => {
    instance = React.useRef<PhotoUploadComponent>();
    return <ComponentType ref={instance} {...props} />;
  });
  rerender(<TestComponent {...props} />);
  return instance.current;
};


// Updated helper function
async function simulatePhotoProcessingUpToLocation(componentInstance: PhotoUploadComponent, sourceType: 'camera' | 'gallery' = 'gallery') {
    const mockImageDataBase64 = "mockBase64ImageData";
    
    // Ensure mocks for camera/filesystem are set up before triggering actions
    if (sourceType === 'gallery') {
        const mockFile = new File(['mock'], 'photo.jpg', { type: 'image/jpeg' });
        const mockEvent = { target: { files: [mockFile] } } as unknown as React.ChangeEvent<HTMLInputElement>;
        const mockReaderInstance = {
            // @ts-ignore
            readAsDataURL: vi.fn(function(this: FileReader) { this.result = `data:image/jpeg;base64,${mockImageDataBase64}`; if(this.onload) this.onload({} as ProgressEvent<FileReader>); }),
            onload: null as ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null,
            onerror: null as Function | null,
        };
        vi.spyOn(global, 'FileReader').mockImplementation(() => mockReaderInstance as unknown as FileReader);
        
        const originalCreateElement = document.createElement;
        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName === 'input') {
                const input = originalCreateElement.call(document, tagName) as HTMLInputElement;
                input.type = 'file';
                input.accept = 'image/*';
                setTimeout(() => { input.onchange!(mockEvent as any); }, 0);
                return input;
            }
            return originalCreateElement.call(document, tagName);
        });

        fireEvent.click(screen.getByText(/Choose from Gallery/i));
        await waitFor(() => expect(global.FileReader).toHaveBeenCalled());
        vi.spyOn(document, 'createElement').mockRestore();
    } else { // camera
        vi.mocked(CapacitorCamera.Camera.getPhoto).mockResolvedValue({
            webPath: 'blob:mockcameraurl', path: 'mock/path/photo.jpg', format: 'jpeg', saved: true,
        });
        vi.mocked(CapacitorFilesystem.Filesystem.readFile).mockResolvedValue({ data: mockImageDataBase64 });
        fireEvent.click(screen.getByText(/Take Photo/i));
        await waitFor(() => expect(CapacitorCamera.Camera.getPhoto).toHaveBeenCalled());
    }
    
    // @ts-ignore Accessing private member for test setup
    const resizeWorkerInstance = componentInstance.resizeWorker;
    if (resizeWorkerInstance) {
      resizeWorkerInstance.postMessage = vi.fn().mockImplementation(({id}) => {
        setTimeout(() => {
          if (resizeWorkerInstance.onmessage) {
            // @ts-ignore
            resizeWorkerInstance.onmessage({ data: { success: true, imageBitmapResult: new ImageBitmap(800,600), id } });
          }
        }, 0);
      });
    }
    
    // @ts-ignore
    vi.spyOn(componentInstance, 'getImageDimensions').mockReturnValue({ width: 800, height: 600 });
    // @ts-ignore
    vi.spyOn(componentInstance, 'imageBitmapToBlob').mockResolvedValue(new Blob(["mockblob"], { type: "image/jpeg" }));
    // @ts-ignore
    vi.spyOn(componentInstance, 'blobToBase64').mockResolvedValue(mockImageDataBase64);

    // Wait for the processing that happens before getLocation
    await waitFor(() => { // @ts-ignore
        expect(componentInstance.getImageDimensions).toHaveBeenCalled()
    });
}


describe('PhotoUploadModal.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    LocationService.getLastKnownLocation = vi.fn().mockResolvedValue(null);
  });

  describe('Scenario: EXIF Location Missing', () => {
    it('calls onMissingLocationData with photo data and original props, then calls onClose', async () => {
      // Mock getLocation to throw an error, simulating missing EXIF/device location
      // @ts-ignore
      vi.spyOn(PhotoUploadComponent.prototype, 'getLocation').mockRejectedValue(new Error('EXIF Error'));
      
      const currentProps = {
        ...mockDefaultProps,
        sitId: "testSit123",
        replacementImageId: "testReplaceImg456"
      };
      const { rerender } = render(<PhotoUploadComponent {...currentProps} />);
      // @ts-ignore
      const instance = getInstance(rerender, PhotoUploadComponent, currentProps);

      await simulatePhotoProcessingUpToLocation(instance!, 'gallery');
      
      await waitFor(() => {
        expect(currentProps.onMissingLocationData).toHaveBeenCalledWith(
          { // Expected photoData (Omit<PhotoResult, 'location'>)
            base64Data: 'mockBase64ImageData',
            dimensions: { width: 800, height: 600 },
          },
          { // Expected originalModalProps
            sitId: "testSit123",
            replacementImageId: "testReplaceImg456",
          }
        );
      });
      
      await waitFor(() => {
        expect(currentProps.onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  // Tests for internal UI state (isEditingLocation, pendingPhotoDataWithoutLocation)
  // and related buttons ("Edit Location", "Cancel" in edit mode) are removed
  // as this functionality has been moved out of PhotoUploadModal.
});

// Mock for ImageBitmap if not globally available
if (typeof global.ImageBitmap === 'undefined') {
    // @ts-ignore
    global.ImageBitmap = class { // Use class for new ImageBitmap()
      constructor(public width = 100, public height = 100) {} // Default dimensions
      close = vi.fn();
    };
}
