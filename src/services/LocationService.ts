import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { Location } from '../types';


type LocationCallback = (location?: Location) => void;

export class LocationService {
  private locationWatchId: string | null = null;
  private locationCallbacks: LocationCallback[] = [];
  private static lastKnownLocation: Location | null = null;
  private trackingPollId: number | null = null;
  private readonly TRACKING_POLL_INTERVAL = 1000; // 1 second
  private readonly LOCATION_TIMEOUT = 5000; // 5 seconds
  private readonly LOCATION_MAX_AGE = 10000; // 10 seconds
  private readonly MIN_UPDATE_INTERVAL_MS = 2000; // Only process updates every 2 seconds

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
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    if (Capacitor.getPlatform() === 'web') {
      this.setupWebWatch();
    } else {
      await this.setupNativeWatch();
    }
  }

  private async requestPermissions(): Promise<boolean> {
    console.log('[LocationService] Requesting permissions...');
    if (Capacitor.getPlatform() !== 'web') {
      let permissionStatus = await Geolocation.requestPermissions();
      return permissionStatus.location === 'granted';
    }
    else {
      let permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
      return permissionStatus.state === 'granted';
    }
  }

  private _startTrackingPoll(): void {
    if (this.trackingPollId) return;

    console.log('[LocationService] Starting location tracking poll...');
    this.trackingPollId = window.setInterval(async () => {
      try {
        await this._startTracking();
      } catch (error) {
        console.warn('Location tracking poll failed:', error);
      }
    }, this.TRACKING_POLL_INTERVAL);
  }

  private _stopTrackingPoll(): void {
    if (this.trackingPollId) {
      console.log('[LocationService] Stopping location tracking poll...');
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
        console.log('[LocationService] Location request timed out');
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
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
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
    const errorCode = error?.code;
    const errorMessage = error?.message?.toLowerCase() ?? '';
    const isPermissionDenied = errorCode === 1 || errorMessage.includes('permission denied');

    if (isPermissionDenied) {
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

    let lastUpdateTime = 0;

    // Initiate watch, store ID locally first
    this.locationWatchId = navigator.geolocation.watchPosition(
      position => {
        // Location found. Remove long polling if exists.
        this._stopTrackingPoll();

        // --- Throttling Logic ---
        const now = Date.now();
        if (now - lastUpdateTime < this.MIN_UPDATE_INTERVAL_MS) {
          return; // Not enough time passed
        }
        lastUpdateTime = now;
        // --- End Throttling ---

        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        console.log('[LocationService] Web watch processed position update.');
        this.handleLocationUpdate(coordinates);
      },
      error => {
        this.handleLocationError(error);
        console.error('Web geolocation error:', error);
      },
      { enableHighAccuracy: true, maximumAge: this.LOCATION_MAX_AGE, timeout: this.LOCATION_TIMEOUT }
    ) as unknown as string;
  }
}