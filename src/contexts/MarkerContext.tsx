import { createContext, useContext, useState, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMap } from './MapContext';
import { useSits } from './SitsContext';
import { useAuth } from './AuthContext';
import { Sit } from '../types';

interface MarkerContextType {
  markers: Map<string, mapboxgl.Marker>;
  createMarker: (sit: Sit) => mapboxgl.Marker;
  updateMarkerStyle: (marker: mapboxgl.Marker, isOwnSit: boolean, isFavorite: boolean) => void;
  removeMarker: (sitId: string) => void;
}

const MarkerContext = createContext<MarkerContextType>({
  markers: new Map(),
  createMarker: () => new mapboxgl.Marker(),
  updateMarkerStyle: () => {},
  removeMarker: () => {},
});

export const useMarkers = () => useContext(MarkerContext);

export const MarkerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [markers, setMarkers] = useState<Map<string, mapboxgl.Marker>>(new Map());
  const { map } = useMap();
  const { sits } = useSits();
  const { user } = useAuth();

  const getMarkerClasses = (isOwnSit: boolean, isFavorite: boolean, isNew: boolean = false): string => {
    const classes = ['satlas-marker'];

    if (isFavorite) {
      classes.push('favorite');
    } else if (isOwnSit) {
      classes.push('own-sit');
    } else {
      classes.push('other-sit');
    }

    if (isNew) {
      classes.push('new');
    }

    return classes.join(' ');
  };

  const createMarker = (sit: Sit): mapboxgl.Marker => {
    const el = document.createElement('div');
    const isOwnSit = sit.uploadedBy === user?.uid;
    const isFavorite = false; // TODO: Get from MarksContext

    el.className = getMarkerClasses(isOwnSit, isFavorite);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.location.longitude, sit.location.latitude]);

    if (map) {
      marker.addTo(map);
    }

    return marker;
  };

  const updateMarkerStyle = (
    marker: mapboxgl.Marker,
    isOwnSit: boolean,
    isFavorite: boolean
  ) => {
    const el = marker.getElement();
    const wasNew = el.classList.contains('new');
    el.className = getMarkerClasses(isOwnSit, isFavorite, wasNew);
  };

  const removeMarker = (sitId: string) => {
    const marker = markers.get(sitId);
    if (marker) {
      marker.remove();
      setMarkers(new Map(markers).set(sitId, marker));
    }
  };

  // Update markers when sits change
  useEffect(() => {
    if (!map) return;

    // Remove markers that no longer exist
    markers.forEach((marker, sitId) => {
      if (!sits.has(sitId)) {
        marker.remove();
        markers.delete(sitId);
      }
    });

    // Add or update markers for each sit
    sits.forEach((sit) => {
      let marker = markers.get(sit.id);

      if (!marker) {
        // Create new marker
        marker = createMarker(sit);
        setMarkers(new Map(markers.set(sit.id, marker)));
      } else {
        // Update existing marker position
        marker.setLngLat([sit.location.longitude, sit.location.latitude]);
      }
    });
  }, [map, sits]);

  return (
    <MarkerContext.Provider
      value={{
        markers,
        createMarker,
        updateMarkerStyle,
        removeMarker,
      }}
    >
      {children}
    </MarkerContext.Provider>
  );
};