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
  const { hasMark } = useMarks();

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
    console.log('MarkerContext: Creating marker for sit:', sit.id);

    const el = document.createElement('div');
    el.className = getMarkerClasses(sit);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.location.longitude, sit.location.latitude]);

    if (map && currentLocation) {
      console.log('MarkerContext: About to call createPopup');
      const popup = createPopup(sit, currentLocation);
      console.log('MarkerContext: Got popup from createPopup:', popup);
      marker.setPopup(popup);
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

  // Update markers when sits change
  useEffect(() => {
    if (!map || !currentLocation) {
      console.log('MarkerContext: Missing map or location:', { map: !!map, currentLocation });
      return;
    }

    console.log('MarkerContext: Updating markers with sits:', sits.size);

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