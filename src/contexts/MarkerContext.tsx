import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMap } from './MapContext';
import { useSits } from './SitsContext';
import { usePopups } from './PopupContext';
import { useAuth } from './AuthContext';
import { useMarks } from './MarksContext';
import { Sit } from '../types';

interface MarkerState {
  id: string;
  position: [number, number];
  classes: string[];
  sit: Sit;
}

interface MarkerContextType {
  getMarker: (id: string) => mapboxgl.Marker | undefined;
  updateMarker: (id: string, updates: Partial<MarkerState>) => void;
}

const MarkerContext = createContext<MarkerContextType>({
  getMarker: () => undefined,
  updateMarker: () => {},
});

export const useMarkers = () => useContext(MarkerContext);

export const MarkerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { map, currentLocation } = useMap();
  const { sits } = useSits();
  const { createPopup } = usePopups();
  const { user } = useAuth();
  const { hasMark } = useMarks();

  // Internal state - not exposed to consumers
  const [mapboxMarkers] = useState<Map<string, mapboxgl.Marker>>(new Map());

  // Helper function to compute marker classes
  const getMarkerClasses = useCallback((sit: Sit): string[] => {
    const classes = ['satlas-marker'];

    if (sit.uploadedBy === user?.uid) {
      classes.push('own-sit');
    }
    if (hasMark(sit.id, 'favorite')) {
      classes.push('favorite');
    }

    return classes;
  }, [user, hasMark]);

  // Compute desired marker states from sits
  const getMarkerStates = useCallback((): Map<string, MarkerState> => {
    const states = new Map();

    sits.forEach((sit) => {
      states.set(sit.id, {
        id: sit.id,
        position: [sit.location.longitude, sit.location.latitude],
        classes: getMarkerClasses(sit),
        sit,
      });
    });

    return states;
  }, [sits, getMarkerClasses]);

  // Single effect to sync MapBox markers with desired state
  useEffect(() => {
    if (!map || !currentLocation) return;

    console.log('Syncing markers with state');
    const desiredStates = getMarkerStates();

    // Remove markers that shouldn't exist
    for (const [id, marker] of mapboxMarkers) {
      if (!desiredStates.has(id)) {
        console.log('Removing marker:', id);
        marker.remove();
        mapboxMarkers.delete(id);
      }
    }

    // Create or update markers based on desired state
    for (const [id, state] of desiredStates) {
      let marker = mapboxMarkers.get(id);

      if (!marker) {
        console.log('Creating new marker:', id);
        const el = document.createElement('div');
        el.className = state.classes.join(' ');  // Set classes before creating marker

        marker = new mapboxgl.Marker(el)
          .setLngLat(state.position)
          .addTo(map);

        // Add popup functionality
        el.addEventListener('click', (e) => {  // Add click handler to element instead of marker
          e.stopPropagation(); // Prevent the map from also handling this click
          const popup = createPopup(state.sit, currentLocation);
          popup.setLngLat(state.position);
          popup.addTo(map);
        });

        mapboxMarkers.set(id, marker);
      } else {
        // Update marker to match desired state
        marker.setLngLat(state.position);
        marker.getElement().className = state.classes.join(' ');
      }
    }
  }, [map, currentLocation, getMarkerStates, createPopup]);

  // Public API
  const getMarker = useCallback((id: string) => mapboxMarkers.get(id), []);

  const updateMarker = useCallback((id: string, updates: Partial<MarkerState>) => {
    const marker = mapboxMarkers.get(id);
    if (!marker) return;

    if (updates.position) {
      marker.setLngLat(updates.position);
    }
    if (updates.classes) {
      marker.getElement().className = updates.classes.join(' ');
    }
  }, []);

  return (
    <MarkerContext.Provider value={{ getMarker, updateMarker }}>
      {children}
    </MarkerContext.Provider>
  );
};