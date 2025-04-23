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
    if (this.locationWatchId) {
      console.log('[LocationService] Watch already active, skipping _startTracking.');
      return;
    }

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

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;

      // Set up timeout
      timeoutId = setTimeout(() => {
        console.log('[LocationService Native] Location request timed out');
        reject(new Error('Location request timed out'));
      }, this.LOCATION_TIMEOUT);

      // Request location
      Geolocation.getCurrentPosition(
        {
          enableHighAccuracy: true,
          timeout: this.LOCATION_TIMEOUT
        }
      )
      .then(position => {
        if (timeoutId) clearTimeout(timeoutId);
        console.log('[LocationService Native] High accuracy succeeded.');
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      })
      .catch(error => {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn('[LocationService Native] High accuracy error:', error);
        reject(error); // Reject with the actual error
      });
    });
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
    const errorCode = error?.code;
    const errorMessage = error?.message?.toLowerCase() ?? '';
    const isPermissionDenied = errorCode === 1 || errorMessage.includes('permission denied');

    if (isPermissionDenied) {
      console.warn('Location error occurred, starting recovery poll.');
      this._startTrackingPoll();
    }
  }

  private async setupNativeWatch(): Promise<void> {
    console.log('[LocationService] setupNativeWatch called.');
    let lastUpdateTime = 0;
    try {
      this.locationWatchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, maximumAge: 0, timeout: this.LOCATION_TIMEOUT }, // Use maximumAge: 0 for watch
        (position, error) => {
        if (error) {
          this.handleLocationError(error);
          return;
        }
        if (position) {
          this._stopTrackingPoll(); // Stop poll on first successful callback
          // --- Throttling Logic ---
          const now = Date.now();
          if (now - lastUpdateTime < this.MIN_UPDATE_INTERVAL_MS) {
            return; // Not enough time passed, ignore this update
          }
          lastUpdateTime = now; // Update timestamp for the processed update
          // --- End Throttling ---

          const coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          this.handleLocationUpdate(coordinates);
        }
      }
    );
      console.log(`[LocationService] Native watch started with ID: ${this.locationWatchId}`);
    } catch (error) {
      console.error('[LocationService] Error starting native watch:', error);
      this.locationWatchId = null; // Ensure watchId is null if watch fails to start
      this.handleLocationError(error);
    }
  }

  private setupWebWatch(): void {
    console.log('[LocationService] setupWebWatch called.');
    let lastUpdateTime = 0;

    try {
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
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: this.LOCATION_TIMEOUT }
      ) as unknown as string;
    } catch (error) {
      console.error('[LocationService] Error starting web watch:', error);
      this.locationWatchId = null; // Ensure watchId is null if watch fails to start
      this.handleLocationError(error);
    }
  }
}