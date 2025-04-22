import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { Location } from '../types';


type LocationCallback = (location?: Location) => void;

export class LocationService {
  private locationWatchId: string | null = null;
  private locationCallbacks: LocationCallback[] = [];
  private hasLocationPermission: boolean = false;
  private static lastKnownLocation: Location | null = null;
  private trackingPollId: number | null = null;
  private readonly TRACKING_POLL_INTERVAL = 1000; // 1 second
  private readonly LOCATION_TIMEOUT = 5000; // 5 seconds
  private readonly LOCATION_MAX_AGE = 10000; // 10 seconds
  private readonly MIN_UPDATE_INTERVAL_MS = 5000; // Only process updates every 5 seconds
  private lastUpdateTime: number = 0; // Timestamp of the last processed update

  constructor() {
    this.onLocationUpdate(LocationService.setLastKnownLocation);
  }

  // Start watching location changes
  public async startTracking(): Promise<void> {
    try {
      await this._startTracking();
    } catch (error) {
      this.handleLocationError(error);
    }
  }

  private async _startTracking(): Promise<void> {
    if (Capacitor.getPlatform() !== 'web') {
      const permissionStatus = await Geolocation.requestPermissions();
      this.hasLocationPermission = permissionStatus.location === 'granted';
      if (!this.hasLocationPermission) {
        throw new Error('Location permission not granted');
      }
    }

    if (Capacitor.getPlatform() === 'web') {
      this.setupWebWatch();
    } else {
      await this.setupNativeWatch();
    }
  }

  private _startTrackingPoll(): void {
    if (this.trackingPollId) return;

    console.log('Starting location tracking poll...');
    this.trackingPollId = window.setInterval(async () => {
      try {
        await this._startTracking();
        // Poll is stopped inside the watch callbacks now on first success
      } catch (error) {
        console.warn('Location tracking poll failed:', error);
      }
    }, this.TRACKING_POLL_INTERVAL);
  }

  private _stopTrackingPoll(): void {
    if (this.trackingPollId) {
      console.log('Stopping location tracking poll...');
      window.clearInterval(this.trackingPollId);
      this.trackingPollId = null;
    }
  }

  // Stop watching location changes
  public async stopTracking(): Promise<void> {
    if (this.locationWatchId) {
      if (Capacitor.getPlatform() === 'web') {
        navigator.geolocation.clearWatch(Number(this.locationWatchId));
      } else {
        await Geolocation.clearWatch({ id: this.locationWatchId });
      }
      this.locationWatchId = null;
    }
    this._stopTrackingPoll();
  }

  // Get current location (one-time)
  async getCurrentLocation(): Promise<Location> {
    try {
      if (Capacitor.getPlatform() !== 'web') {
        return await this.getLocationNative();
      }
      return await this.getLocationWeb();
    } catch (error) {
      this.handleLocationError(error);
      // Check if we have a fallback location
      const lastLocation = LocationService.getLastKnownLocation();
      if (lastLocation) {
        return lastLocation;
      }
      // If no fallback location, throw the error
      throw new Error('Unable to get current location');
    }
  }

  private async getLocationWeb(): Promise<Location> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      const timeoutId = setTimeout(() => {
        console.log('Location request timed out');
        reject(new Error('Location request timed out'));
      }, this.LOCATION_TIMEOUT);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          resolve(location);
        },
        (error) => {
          clearTimeout(timeoutId);
          console.warn('Geolocation error:', error.code, error.message);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: this.LOCATION_TIMEOUT,
          maximumAge: this.LOCATION_MAX_AGE
        }
      );
    });
  }

  private async getLocationNative(): Promise<Location> {
    if (!this.hasLocationPermission) {
      console.log('Requesting location permissions...');
      const request = await Geolocation.requestPermissions();
      this.hasLocationPermission = request.location === 'granted';

      if (!this.hasLocationPermission) {
        console.warn('Location permission denied');
        throw new Error('Location permission denied');
      }
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Location request timed out'));
      }, this.LOCATION_TIMEOUT);
    });

    try {
      // --- Try Low Accuracy First ---
      console.log('[LocationService] Attempting low accuracy first...');
      try {
        const position = await Promise.race([
          Geolocation.getCurrentPosition({
            enableHighAccuracy: false, // Low accuracy
            timeout: this.LOCATION_TIMEOUT
          }),
          timeoutPromise
        ]);
        console.log('[LocationService] Low accuracy succeeded.');
        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
      } catch (lowAccuracyError) {
        console.warn('[LocationService] Low accuracy failed, trying high accuracy:', lowAccuracyError);
        // Clear the first timeout promise and create a new one for the high accuracy attempt
        // Note: The original timeoutPromise might have already rejected, but creating a new one is cleaner.
        const highAccuracyTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('High accuracy location request timed out'));
          }, this.LOCATION_TIMEOUT);
        });

        // --- Fallback to High Accuracy ---
        const position = await Promise.race([
          Geolocation.getCurrentPosition({
            enableHighAccuracy: true, // High accuracy
            timeout: this.LOCATION_TIMEOUT
          }),
          highAccuracyTimeoutPromise
        ]);
        console.log('[LocationService] High accuracy fallback succeeded.');
        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
      }
    } catch (error) {
      this.handleLocationError(error);
      throw error;
    }
  }

  public static setLastKnownLocation(location?: Location): void {
    LocationService.lastKnownLocation = location || null;
  }

  public static getLastKnownLocation(): Location | null{
    return LocationService.lastKnownLocation || null;
  }

  // Register a callback to receive location updates
  public onLocationUpdate(callback: LocationCallback): void {
    this.locationCallbacks.push(callback);
  }

  // Remove a previously registered callback
  public offLocationUpdate(callback: LocationCallback): void {
    this.locationCallbacks = this.locationCallbacks.filter(cb => cb !== callback);
  }

  private handleLocationUpdate(location: Location): void {
    this.locationCallbacks.forEach(callback => {
      try {
        callback(location);
      } catch (error) {
        console.error('Error in location listener:', error);
      }
    });
  }

  private handleLocationError(error: any): void {
    console.error('LocationService error:', error?.code, error?.message, error);

    // Use optional chaining and nullish coalescing for safer access
    // Reset watch ID in case the error came from a failed watch setup
    this.locationWatchId = null;
    const errorCode = error?.code;
    const errorMessage = error?.message?.toLowerCase() ?? '';
    const isPermissionDenied = errorCode === 1 || errorMessage.includes('permission denied');

    if (isPermissionDenied) {
      this.hasLocationPermission = false;
      console.warn('Location permission explicitly denied by user.');
      // Optionally, stop trying altogether if permission is denied
      this.stopTracking(); // Stop polling and watching if denied
    } else {
      // For other errors (timeout, unavailable, unknown), start polling to recover
      console.warn('Location error occurred, starting recovery poll.');
      this._startTrackingPoll();
    }
  }

  private async setupNativeWatch(): Promise<void> {
    // Initiate watch, store ID locally first
    const localWatchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, maximumAge: 0, timeout: this.LOCATION_TIMEOUT }, // Use maximumAge: 0 for watch
      (position, error) => {
        if (error) {
          this.handleLocationError(error);
          return;
        }
        if (position) {
          // --- Throttling Logic ---
          const now = Date.now();
          if (now - this.lastUpdateTime < this.MIN_UPDATE_INTERVAL_MS) {
            return; // Not enough time passed, ignore this update
          }
          this.lastUpdateTime = now; // Update timestamp for the processed update

          // Assign instance watchId and stop poll ONLY on the first successful update
          if (this.locationWatchId === null) {
            console.log(`[LocationService] First success for native watch. Assigning ID: ${localWatchId}`);
            this.locationWatchId = localWatchId;
            this._stopTrackingPoll();
          }
          // --- End Throttling ---

          const coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          this._stopTrackingPoll();
          console.log('[LocationService] Native watch processed position update.');
          this.handleLocationUpdate(coordinates);
        }
      }
    );
  }

  private setupWebWatch(): void {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported in this browser');
    }

    // Initiate watch, store ID locally first
    const localWatchId = navigator.geolocation.watchPosition(
      position => {
        // --- Throttling Logic ---
        const now = Date.now();
        if (now - this.lastUpdateTime < this.MIN_UPDATE_INTERVAL_MS) {
          // console.log('[LocationService] Throttled web update'); // Optional debug log
          return; // Not enough time passed
        }

        // Assign instance watchId and stop poll ONLY on the first successful update
        if (this.locationWatchId === null) {
          console.log(`[LocationService] First success for web watch. Assigning ID: ${localWatchId}`);
          this.locationWatchId = localWatchId as unknown as string; // Assign and cast
          this._stopTrackingPoll();
        }

        this.lastUpdateTime = now;
        // --- End Throttling ---

        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        this._stopTrackingPoll();
        console.log('[LocationService] Web watch processed position update.');
        this.handleLocationUpdate(coordinates);
      },
      error => {
        this.handleLocationError(error);
        // Don't reset lastUpdateTime here
        console.error('Web geolocation error:', error);
      },
      { enableHighAccuracy: true, maximumAge: this.LOCATION_MAX_AGE, timeout: this.LOCATION_TIMEOUT }
    ) as unknown as string;
  }
}