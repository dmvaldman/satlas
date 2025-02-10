import { createContext, useContext, useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Coordinates } from '../types';
import { Geolocation } from '@capacitor/geolocation';

// Replace with your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZG12YWxkbWFuIiwiYSI6ImNpbXRmNXpjaTAxem92OWtrcHkxcTduaHEifQ.6sfBuE2sOf5bVUU6cQJLVQ';

interface MapContextType {
  map: mapboxgl.Map | null;
  currentLocation: Coordinates | null;
  getCurrentLocation: () => Promise<Coordinates>;
  isLoading: boolean;
  getBounds: () => { north: number; south: number } | null;
}

const MapContext = createContext<MapContextType>({
  map: null,
  currentLocation: null,
  getCurrentLocation: async () => ({ latitude: 0, longitude: 0 }),
  isLoading: true,
  getBounds: () => null,
});

export const useMap = () => useContext(MapContext);

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getCurrentLocation = async (): Promise<Coordinates> => {
    try {
      // Try high accuracy first
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      });

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      setCurrentLocation(coords);
      return coords;

    } catch (error) {
      console.log('High accuracy location failed, trying with lower accuracy...', error);

      try {
        // Try lower accuracy
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000
        });

        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        setCurrentLocation(coords);
        return coords;

      } catch (error) {
        console.error('Error getting location:', error);

        // Use last known location if available
        if (currentLocation) {
          return currentLocation;
        }

        // Use map center if available
        if (mapRef.current) {
          const center = mapRef.current.getCenter();
          return {
            latitude: center.lat,
            longitude: center.lng
          };
        }

        throw new Error('Could not get location');
      }
    }
  };

  useEffect(() => {
    const initializeMap = async () => {
      try {
        const coordinates = await getCurrentLocation();

        const map = new mapboxgl.Map({
          container: 'map-container',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [coordinates.longitude, coordinates.latitude],
          zoom: 13
        });

        map.on('load', () => {
          setIsLoading(false);
        });

        mapRef.current = map;

      } catch (error) {
        console.error('Error initializing map:', error);
        // Use default NYC coordinates
        const map = new mapboxgl.Map({
          container: 'map-container',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-74.006, 40.7128],
          zoom: 13
        });

        mapRef.current = map;
        setIsLoading(false);
      }
    };

    initializeMap();

    return () => {
      mapRef.current?.remove();
    };
  }, []);

  const getBounds = () => {
    if (!mapRef.current) return null;
    const bounds = mapRef.current.getBounds();
    return {
      north: bounds.getNorth(),
      south: bounds.getSouth()
    };
  };

  return (
    <MapContext.Provider
      value={{
        map: mapRef.current,
        currentLocation,
        getCurrentLocation,
        isLoading,
        getBounds,
      }}
    >
      {children}
    </MapContext.Provider>
  );
};