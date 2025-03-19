import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

interface Location {
  latitude: number;
  longitude: number;
}

type LocationCallback = (location: Location) => void;

const LOCATION_TIMEOUT = 3000; // 3 seconds

export class LocationService {
  private locationWatchId: string | null = null;
  private locationCallbacks: LocationCallback[] = [];
  private hasLocationPermission: boolean = false;
  private static lastKnownLocation: Location | null = null;

  constructor(storage: Storage = localStorage) {
    this.addLocationListener(LocationService.setLastKnownLocation);
  }

  // Start watching location changes
  public async startLocationTracking(): Promise<void> {
    if (this.locationWatchId) return;

    try {
      if (Capacitor.getPlatform() !== 'web') {
        const permissionStatus = await Geolocation.requestPermissions();
        this.hasLocationPermission = permissionStatus.location === 'granted';
        if (!this.hasLocationPermission) {
          console.warn('Location permission not granted');
          return;
        }
      }

      if (Capacitor.getPlatform() === 'web') {
        this.setupWebWatch();
      } else {
        await this.setupNativeWatch();
      }
    } catch (error) {
      this.handleLocationError(error);
    }
  }

  // Stop watching location changes
  public async stopLocationTracking(): Promise<void> {
    if (this.locationWatchId) {
      if (Capacitor.getPlatform() === 'web') {
        navigator.geolocation.clearWatch(Number(this.locationWatchId));
      } else {
        await Geolocation.clearWatch({ id: this.locationWatchId });
      }
      this.locationWatchId = null;
    }
  }

  // Get current location (one-time)
  async getCurrentLocation(): Promise<Location | null> {
    try {
      if (Capacitor.getPlatform() !== 'web') {
        return await this.getLocationNative();
      }
      return await this.getLocationWeb();
    } catch (error) {
      this.handleLocationError(error);
      return LocationService.getLastKnownLocation();
    }
  }

  private async getLocationWeb(): Promise<Location | null> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      const timeoutId = setTimeout(() => {
        console.log('Location request timed out, using fallbacks');
        const location = LocationService.getLastKnownLocation();
        if (location) {
          resolve(location);
        } else {
          reject(new Error('No location available'));
        }
      }, LOCATION_TIMEOUT);

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
          const location = LocationService.getLastKnownLocation();
          if (location) {
            resolve(location);
          } else {
            reject(new Error('No location available'));
          }
        },
        {
          enableHighAccuracy: true,
          timeout: LOCATION_TIMEOUT,
          maximumAge: 10000
        }
      );
    });
  }

  private async getLocationNative(): Promise<Location | null> {
    if (!this.hasLocationPermission) {
      console.log('Requesting location permissions...');
      const request = await Geolocation.requestPermissions();
      this.hasLocationPermission = request.location === 'granted';

      if (!this.hasLocationPermission) {
        console.warn('Location permission denied');
        return LocationService.getLastKnownLocation();
      }
    }

    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: LOCATION_TIMEOUT
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    } catch (error) {
      this.handleLocationError(error);
      return LocationService.getLastKnownLocation();
    }
  }

  private setupWebWatch(): void {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported in this browser');
    }

    this.locationWatchId = navigator.geolocation.watchPosition(
      position => {
        this.handleLocationUpdate({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      error => {
        this.handleLocationError(error);
        console.error('Web geolocation error:', error);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    ) as unknown as string;
  }

  private async setupNativeWatch(): Promise<void> {
    this.locationWatchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true },
      (position, error) => {
        if (error) {
          this.handleLocationError(error);
          return;
        }
        if (position) this.handleLocationUpdate({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      }
    );
  }

  public static setLastKnownLocation(location: Location): void {
    LocationService.lastKnownLocation = location;
  }

  public static getLastKnownLocation(): Location | null{
    return LocationService.lastKnownLocation || null;
  }

  // Register a callback to receive location updates
  public addLocationListener(callback: LocationCallback): void {
    this.locationCallbacks.push(callback);
  }

  // Remove a previously registered callback
  public removeLocationListener(callback: LocationCallback): void {
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
    console.error('Location error:', error);

    if (error?.message?.includes('permission') || error?.code === 1) {
      this.hasLocationPermission = false;
      console.warn('Location permission revoked');
    }
  }

}