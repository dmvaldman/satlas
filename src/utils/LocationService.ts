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
const LOCATION_TIMEOUT = 5000;
const LOCATION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export class LocationService {
  private storage: Storage;

  constructor(storage: Storage = localStorage) {
    this.storage = storage;
  }

  async getCurrentLocation(): Promise<Location> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        // Try to get last known location
        this.getLastKnownLocation().then(location => {
          if (location) {
            resolve(location);
          } else {
            reject(new Error('Geolocation is not supported and no last location available'));
          }
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          // Save the location
          this.saveLastKnownLocation(location);
          resolve(location);
        },
        async (error) => {
          // Try to get last known location on error
          const lastLocation = await this.getLastKnownLocation();
          if (lastLocation) {
            resolve(lastLocation);
          } else {
            reject(error);
          }
        },
        {
          enableHighAccuracy: false,
          timeout: LOCATION_TIMEOUT,
          maximumAge: 10000
        }
      );
    });
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