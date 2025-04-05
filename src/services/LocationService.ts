import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { Location } from '../types';


type LocationCallback = (location?: Location) => void;

export class LocationService {
  private locationWatchId: string | null = null;
  private locationCallbacks: LocationCallback[] = [];
  private onReconnectCallbacks: LocationCallback[] = [];
  private onDisconnectCallbacks: (() => void)[] = [];
  private hasLocationPermission: boolean = false;
  private static lastKnownLocation: Location | null = null;
  private trackingPollId: number | null = null;
  private readonly TRACKING_POLL_INTERVAL = 1000; // 1 second
  private readonly LOCATION_TIMEOUT = 3000; // 3 seconds
  private readonly LOCATION_MAX_AGE = 5000; // 5 seconds
  private isConnected: boolean = false;

  constructor() {
    this.onLocationUpdate(LocationService.setLastKnownLocation);
  }

  // Start watching location changes
  public async startTracking(): Promise<void> {
    await this.stopTracking();

    try {
      await this._startTracking();
    } catch (error) {
      this.handleLocationError(error);
    }
  }

  private async _startTracking(): Promise<void> {
    // Stop any existing poll immediately if we're attempting to start tracking
    this._stopTrackingPoll();

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
        this._stopTrackingPoll();
      } catch (error) {
        console.warn('Location tracking poll failed:', error);
      }
    }, this.TRACKING_POLL_INTERVAL);
  }

  private _stopTrackingPoll(): void {
    if (this.trackingPollId) {
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
      this.handleConnectionStateChange(false);
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
      // First try with high accuracy
      try {
        const position = await Promise.race([
          Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: this.LOCATION_TIMEOUT
          }),
          timeoutPromise
        ]);

        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
      } catch (highAccuracyError) {
        console.log('High accuracy location failed, falling back to low accuracy:', highAccuracyError);

        // Fallback to low accuracy with timeout
        const position = await Promise.race([
          Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: this.LOCATION_TIMEOUT
          }),
          timeoutPromise
        ]);

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

  private handleLocationUpdate(location?: Location): void {
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

    // Assume disconnected on error
    this.handleConnectionStateChange(false);

    // Check for explicit permission denial (code 1 or specific message)
    const isPermissionDenied = error?.code === 1 || error?.message?.toLowerCase().includes('permission denied');

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

  // Add handlers for GPS connection state changes
  public onReconnect(callback: LocationCallback) {
    this.onReconnectCallbacks.push(callback);
  }

  public offReconnect(callback: LocationCallback): void {
    this.onReconnectCallbacks = this.onReconnectCallbacks.filter(cb => cb !== callback);
  }

  public onDisconnect(callback: () => void): void {
    this.onDisconnectCallbacks.push(callback);
  }

  public offDisconnect(callback: () => void): void {
    this.onDisconnectCallbacks = this.onDisconnectCallbacks.filter(cb => cb !== callback);
  }

  private handleConnectionStateChange(isConnected: boolean, coordinates?: Location): void {
    if (this.isConnected === isConnected) return;

    this.isConnected = isConnected;
    if (isConnected) {
      this.onReconnectCallbacks.forEach(callback => {
        try {
          callback(coordinates);
        } catch (error) {
          console.error('Error in reconnect listener:', error);
        }
      });
    } else {
      this.onDisconnectCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Error in disconnect listener:', error);
        }
      });
    }
  }

  private async setupNativeWatch(): Promise<void> {
    this.locationWatchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true },
      (position, error) => {
        if (error) {
          this.handleLocationError(error);
          this.handleConnectionStateChange(false);
          return;
        }
        if (position) {
          const coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          // Stop polling if we get a successful watch update
          this._stopTrackingPoll();
          console.log('[LocationService] Native watch received position update.');
          this.handleConnectionStateChange(true, coordinates);
          this.handleLocationUpdate(coordinates);
        }
      }
    );
  }

  private setupWebWatch(): void {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported in this browser');
    }

    this.locationWatchId = navigator.geolocation.watchPosition(
      position => {
        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        this._stopTrackingPoll();
        this.handleConnectionStateChange(true, coordinates);
        this.handleLocationUpdate(coordinates);
      },
      error => {
        this.handleLocationError(error);
        this.handleConnectionStateChange(false);
        console.error('Web geolocation error:', error);
      },
      { enableHighAccuracy: true, maximumAge: this.LOCATION_MAX_AGE, timeout: this.LOCATION_TIMEOUT }
    ) as unknown as string;
  }
}