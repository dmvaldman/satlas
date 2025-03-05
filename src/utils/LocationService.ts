import { Geolocation, Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

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
    try {
      // Check if we're on a native platform
      if (Capacitor.getPlatform() !== 'web') {
        console.log('Checking location permissions...');
        const permissions = await Geolocation.checkPermissions();
        console.log('Current permissions:', permissions);

        if (permissions.location !== 'granted') {
          console.log('Requesting location permissions...');
          const request = await Geolocation.requestPermissions();
          console.log('Permission request result:', request);

          if (request.location !== 'granted') {
            console.warn('Location permission denied');
            return this.getLocationFallback();
          }
        }

        // Native implementation
        console.log('Getting location on native platform');

        // Request permissions first
        const permissionStatus = await Geolocation.requestPermissions();
        console.log('Permission status:', permissionStatus);

        if (permissionStatus.location === 'granted') {
          try {
            const position: Position = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: LOCATION_TIMEOUT
            });

            console.log('Got native position:', position);

            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };

            this.saveLastKnownLocation(location);
            return location;
          } catch (error) {
            console.error('Error getting native position:', error);
            return this.getLocationFallback();
          }
        } else {
          console.log('Location permission not granted, using fallback');
          return this.getLocationFallback();
        }
      } else {
        // Web implementation
        console.log('Getting location on web platform');
        return this.getLocationFromBrowser();
      }
    } catch (error) {
      console.error('Error getting location:', error);
      return this.getLocationFallback();
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