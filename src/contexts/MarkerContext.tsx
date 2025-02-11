import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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
  createPendingMarker: (sit: Sit) => void;
  updateMarker: (tempId: string, newSit: Sit) => void;
}

const MarkerContext = createContext<MarkerContextType>({
  markers: new Map(),
  createMarker: () => new mapboxgl.Marker(),
  removeMarker: () => {},
  createPendingMarker: () => {},
  updateMarker: () => {},
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

    console.log('Creating marker with coordinates:', [sit.location.longitude, sit.location.latitude]);

    const marker = new mapboxgl.Marker(el);

    marker.setLngLat([sit.location.longitude, sit.location.latitude]);

    if (map && currentLocation) {
      marker.setPopup(createPopup(sit, currentLocation));
    }

    return marker;
  };

  const createPendingMarker = useCallback((sit: Sit) => {
    if (!map) return;

    const el = document.createElement('div');
    el.className = 'satlas-marker pending';

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.location.longitude, sit.location.latitude])
      .addTo(map);

    const popup = new mapboxgl.Popup({ closeButton: false })
      .setHTML('<div class="satlas-popup-loading"><p>Uploading...</p></div>');

    marker.setPopup(popup);
    markers.set(sit.id, marker);
  }, [map]);

  const updateMarker = useCallback((tempId: string, newSit: Sit) => {
    const marker = markers.get(tempId);
    if (!marker) return;

    marker.setLngLat([newSit.location.longitude, newSit.location.latitude]);

    const el = marker.getElement();
    el.className = getMarkerClasses(newSit);

    if (map && currentLocation) {
      marker.setPopup(createPopup(newSit, currentLocation));
    }

    markers.delete(tempId);
    markers.set(newSit.id, marker);
  }, [map, currentLocation, createPopup]);

  const removeMarker = useCallback((markerId: string) => {
    const marker = markers.get(markerId);
    if (marker) {
      marker.remove();
      markers.delete(markerId);
    }
  }, []);

  const value = useMemo(() => ({
    markers,
    createMarker,
    removeMarker,
    createPendingMarker,
    updateMarker,
  }), [markers, createMarker, removeMarker, createPendingMarker, updateMarker]);

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

    console.log('MarkerContext useEffect - sits changed:', Array.from(sits.keys()));

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

  useEffect(() => {
    const handleSitDeleted = (event: Event) => {
      const customEvent = event as CustomEvent<{ sitId: string }>;
      const sitId = customEvent.detail.sitId;
      console.log('Handling sitDeleted event:', { sitId });

      // Remove the marker from the map
      const marker = markers.get(sitId);
      debugger;
      if (marker) {
        console.log('Found marker, removing from map:', marker);
        marker.remove();  // This removes the marker from the map
        markers.delete(sitId);  // This removes it from our markers Map
        setMarkers(new Map(markers));  // This updates the state with a new Map
        console.log('Marker removed and state updated');
      }

      // Close popup if it's open
      if (map) {
        const popups = document.getElementsByClassName('mapboxgl-popup');
        for (let i = 0; i < popups.length; i++) {
          popups[i].remove();
        }
      }
    };

    window.addEventListener('sitDeleted', handleSitDeleted);
    return () => {
      window.removeEventListener('sitDeleted', handleSitDeleted);
    };
  }, [markers, map]);

  return (
    <MarkerContext.Provider
      value={value}
    >
      {children}
    </MarkerContext.Provider>
  );
};