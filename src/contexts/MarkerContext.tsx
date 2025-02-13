import { createContext, useContext, useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMap } from './MapContext';
import { usePopups } from './PopupContext';
import { useSits } from './SitsContext';
import { Sit } from '../types';

interface MarkerContextType {
  createMarker: (sit: Sit) => void;
  deleteMarker: (sitId: string) => void;
  loadMarkers: (sits: Sit[]) => void;
  getMarker: (id: string) => mapboxgl.Marker | undefined;
  updateMarkerStyle: (sitId: string, classes: string[]) => void;
}

const MarkerContext = createContext<MarkerContextType>({
  createMarker: () => {},
  deleteMarker: () => {},
  loadMarkers: () => {},
  getMarker: () => undefined,
  updateMarkerStyle: () => {},
});

export const useMarkers = () => useContext(MarkerContext);

export const MarkerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { map } = useMap();
  const { createPopup } = usePopups();
  const { sits } = useSits();
  const [mapboxMarkers] = useState<Map<string, mapboxgl.Marker>>(new Map());
  const activePopupRef = useRef<mapboxgl.Popup | null>(null);

  const createMarkerElement = (sit: Sit, classes: string[]) => {
    const el = document.createElement('div');
    el.className = classes.join(' ');

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activePopupRef.current?.isOpen()) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      } else {
        const markerLocation = {
          latitude: sit.location.latitude,
          longitude: sit.location.longitude
        };
        const popup = createPopup(sit, markerLocation);
        popup.setLngLat([sit.location.longitude, sit.location.latitude]);
        popup.addTo(map!);
        activePopupRef.current = popup;
      }
    });

    return el;
  };

  const createMarker = (sit: Sit) => {
    if (!map) return;

    const classes = ['satlas-marker']; // Base classes, can be updated later
    const el = createMarkerElement(sit, classes);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.location.longitude, sit.location.latitude])
      .addTo(map);

    mapboxMarkers.set(sit.id, marker);
  };

  const deleteMarker = (sitId: string) => {
    const marker = mapboxMarkers.get(sitId);
    if (marker) {
      // Close popup if it's open
      if (activePopupRef.current?.isOpen()) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }

      marker.remove();
      mapboxMarkers.delete(sitId);
    }
  };

  const loadMarkers = (sits: Sit[]) => {
    if (!map) return;

    // Clear existing markers
    mapboxMarkers.forEach(marker => marker.remove());
    mapboxMarkers.clear();

    // Create new markers
    sits.forEach(sit => createMarker(sit));
  };

  const getMarker = (id: string) => mapboxMarkers.get(id);

  const updateMarkerStyle = (sitId: string, classes: string[]) => {
    const marker = mapboxMarkers.get(sitId);
    if (marker) {
      marker.getElement().className = classes.join(' ');
    }
  };

  useEffect(() => {
    // Listen for map ready event
    const handleMapReady = () => {
      loadMarkers(Array.from(sits.values()));
    };
    window.addEventListener('mapReady', handleMapReady);

    // Listen for new sit created
    const handleNewSit = (e: CustomEvent<{ sit: Sit }>) => {
      createMarker(e.detail.sit);
    };
    window.addEventListener('sitCreated', handleNewSit as EventListener);

    // Listen for sit deleted
    const handleSitDeleted = (e: CustomEvent<{ sitId: string }>) => {
      deleteMarker(e.detail.sitId);
    };
    window.addEventListener('sitDeleted', handleSitDeleted as EventListener);

    return () => {
      window.removeEventListener('mapReady', handleMapReady);
      window.removeEventListener('sitCreated', handleNewSit as EventListener);
      window.removeEventListener('sitDeleted', handleSitDeleted as EventListener);
    };
  }, [map]);

  return (
    <MarkerContext.Provider value={{
      createMarker,
      deleteMarker,
      loadMarkers,
      getMarker,
      updateMarkerStyle,
    }}>
      {children}
    </MarkerContext.Provider>
  );
};