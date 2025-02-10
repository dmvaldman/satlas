import { createContext, useContext, useState, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMap } from './MapContext';
import { useSits } from './SitsContext';
import { usePopups } from './PopupContext';
import { useAuth } from './AuthContext';
import { useMarks } from './MarksContext';
import { Sit } from '../types';

interface MarkerContextType {
  markers: Map<string, mapboxgl.Marker>;
  createMarker: (sit: Sit) => mapboxgl.Marker;
  removeMarker: (sitId: string) => void;
}

const MarkerContext = createContext<MarkerContextType>({
  markers: new Map(),
  createMarker: () => new mapboxgl.Marker(),
  removeMarker: () => {},
});

export const useMarkers = () => useContext(MarkerContext);

export const MarkerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [markers, setMarkers] = useState<Map<string, mapboxgl.Marker>>(new Map());
  const { map, currentLocation } = useMap();
  const { sits } = useSits();
  const { user } = useAuth();
  const { createPopup } = usePopups();
  const { hasMark, marks } = useMarks();

  const getMarkerClasses = (sit: Sit): string => {
    const classes = ['satlas-marker'];
    const isOwnSit = sit.uploadedBy === user?.uid;
    const isFavorite = hasMark(sit.id, 'favorite');

    if (isOwnSit) {
      classes.push('own-sit');
    }
    if (isFavorite) {
      classes.push('favorite');
    }

    return classes.join(' ');
  };

  const createMarker = (sit: Sit): mapboxgl.Marker => {
    const el = document.createElement('div');
    el.className = getMarkerClasses(sit);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.location.longitude, sit.location.latitude]);

    if (map && currentLocation) {
      marker.setPopup(createPopup(sit, currentLocation));
    }

    return marker;
  };

  const removeMarker = (sitId: string) => {
    const marker = markers.get(sitId);
    if (marker) {
      marker.remove();
      setMarkers(new Map(markers).set(sitId, marker));
    }
  };

  useEffect(() => {
    if (!map || !currentLocation) return;

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
        marker = createMarker(sit);
        marker.addTo(map);
        markers.set(sit.id, marker);
      } else {
        // Update existing marker
        marker.setLngLat([sit.location.longitude, sit.location.latitude]);
        // Update popup if needed
        if (marker.getPopup()) {
          const popup = createPopup(sit, currentLocation);
          marker.setPopup(popup);
        }
      }
    });

    setMarkers(new Map(markers));
  }, [map, sits, currentLocation, createPopup]);

  useEffect(() => {
    if (!map || !sits) return;

    // Remove existing markers
    const existingMarkers = document.getElementsByClassName('marker');
    while (existingMarkers.length > 0) {
      existingMarkers[0].remove();
    }

    // Create markers
    sits.forEach(sit => {
      const el = document.createElement('div');
      el.className = 'marker';

      // Add mark-based classes
      const sitMarks = marks.get(sit.id) || new Set();
      if (sitMarks.has('favorite')) {
        el.classList.add('favorite');
      }
      if (sitMarks.has('visited')) {
        el.classList.add('visited');
      }
      if (sitMarks.has('wantToGo')) {
        el.classList.add('want-to-go');
      }

      // ... rest of marker creation code ...
    });
  }, [map, sits, marks]);

  return (
    <MarkerContext.Provider
      value={{
        markers,
        createMarker,
        removeMarker,
      }}
    >
      {children}
    </MarkerContext.Provider>
  );
};