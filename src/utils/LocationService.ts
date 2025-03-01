interface StoredLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface Location {
  latitude: number;
  longitude: number;
}

const LAST_LOCATION_KEY = 'lastKnownLocation';
const LOCATION_TIMEOUT = 5000; // 5 seconds
const LOCATION_MAX_AGE = 1 * 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_LOCATION = { latitude: 37.7749, longitude: -122.4194 }; // San Francisco

export class LocationService {
  private storage: Storage;

  constructor(storage: Storage = localStorage) {
    this.storage = storage;
  }

  async getCurrentLocation(): Promise<Location> {
    // First check if we have permission
    try {
      const permissionStatus = await this.checkLocationPermission();

      if (permissionStatus === 'granted') {
        return this.getLocationFromBrowser();
      } else if (permissionStatus === 'prompt') {
        // We'll try to get location which will trigger the prompt
        return this.getLocationFromBrowser();
      } else {
        // Permission denied, try fallbacks
        console.log('Location permission denied, using fallbacks');
        return this.getLocationFallback();
      }
    } catch (error) {
      console.error('Error checking location permission:', error);
      return this.getLocationFallback();
    }
  }

  private async checkLocationPermission(): Promise<PermissionState> {
    if (!navigator.permissions || !navigator.permissions.query) {
      // Browser doesn't support permission API
      return 'prompt';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return result.state;
    } catch (error) {
      console.error('Error querying permission:', error);
      return 'prompt';
    }
  }

  private async getLocationFromBrowser(): Promise<Location> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      const timeoutId = setTimeout(() => {
        console.log('Location request timed out, using fallbacks');
        this.getLocationFallback().then(resolve).catch(reject);
      }, LOCATION_TIMEOUT);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          this.saveLastKnownLocation(location);
          resolve(location);
        },
        (error) => {
          clearTimeout(timeoutId);
          console.warn('Geolocation error:', error.code, error.message);
          this.getLocationFallback().then(resolve).catch(reject);
        },
        {
          enableHighAccuracy: true,
          timeout: LOCATION_TIMEOUT,
          maximumAge: 10000
        }
      );
    });
  }

  private async getLocationFallback(): Promise<Location> {
    // Try stored location first
    const storedLocation = await this.getLastKnownLocation();
    if (storedLocation) {
      console.log('Using stored location');
      return storedLocation;
    }

    // If no stored location, use default
    console.log('No stored location, using default');
    return DEFAULT_LOCATION;
  }

  private async saveLastKnownLocation(location: Location): Promise<void> {
    const storedLocation: StoredLocation = {
      ...location,
      timestamp: Date.now()
    };
    this.storage.setItem(LAST_LOCATION_KEY, JSON.stringify(storedLocation));
  }

  private async getLastKnownLocation(): Promise<Location | null> {
    const stored = this.storage.getItem(LAST_LOCATION_KEY);
    if (!stored) return null;

    try {
      const location: StoredLocation = JSON.parse(stored);
      if (Date.now() - location.timestamp > LOCATION_MAX_AGE) {
        this.storage.removeItem(LAST_LOCATION_KEY);
        return null;
      }
      return {
        latitude: location.latitude,
        longitude: location.longitude
      };
    } catch (e) {
      this.storage.removeItem(LAST_LOCATION_KEY);
      return null;
    }
  }
}