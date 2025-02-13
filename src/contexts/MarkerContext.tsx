import { createContext, useContext, useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMap } from './MapContext';
import { usePopups } from './PopupContext';
import { useSits } from './SitsContext';
import { Sit, MarkType } from '../types';
import { useAuth } from './AuthContext';
import { useMarks } from './MarksContext';

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
  const { sits, loadNearbySits } = useSits();
  const { user } = useAuth();
  const { hasMark, marksLoaded } = useMarks();
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

    const classes = ['satlas-marker'];

    // Add classes based on sit properties
    if (sit.uploadedBy === user?.uid) {
      classes.push('own-sit');
    }

    // Add favorite class if it's favorited
    if (hasMark(sit.id, 'favorite')) {
      classes.push('favorite');
    }

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
    // Instead of listening for a standalone event, wait for map, user, and marksLoaded.
    if (!map || !user || !marksLoaded) return;
    const loadData = async () => {
      const bounds = map.getBounds();
      try {
        const loadedSits = await loadNearbySits({
          north: bounds.getNorth(),
          south: bounds.getSouth()
        });
        loadMarkers(loadedSits);
        // Animate markers to fade in by adding the "visible" class
        mapboxMarkers.forEach(marker => {
          const el = marker.getElement();
          // Triggering reflow optionally:
          void el.offsetWidth;
          el.classList.add('visible');
        });
      } catch (error) {
        console.error('Error loading initial sits:', error);
      }
    };
    loadData();
  }, [map, user, marksLoaded, loadNearbySits]);

  // Listen for new sit created, sit deleted, and mark updates as before
  useEffect(() => {
    const handleNewSit = (e: CustomEvent<{ sit: Sit }>) => {
      createMarker(e.detail.sit);
    };
    window.addEventListener('sitCreated', handleNewSit as EventListener);

    const handleSitDeleted = (e: CustomEvent<{ sitId: string }>) => {
      deleteMarker(e.detail.sitId);
    };
    window.addEventListener('sitDeleted', handleSitDeleted as EventListener);

    const handleMarkUpdate = (e: CustomEvent<{
      sitId: string;
      type: MarkType;
      isActive: boolean;
      userId: string;
    }>) => {
      const marker = mapboxMarkers.get(e.detail.sitId);
      if (!marker) return;
      const el = marker.getElement();
      const classes = el.className.split(' ').filter(c => c !== 'favorite');
      if (e.detail.type === 'favorite' && e.detail.isActive) {
        classes.push('favorite');
      } else if (e.detail.userId === user?.uid) {
        classes.push('own-sit');
      }
      el.className = classes.join(' ');
    };
    window.addEventListener('markUpdated', handleMarkUpdate as EventListener);

    return () => {
      window.removeEventListener('sitCreated', handleNewSit as EventListener);
      window.removeEventListener('sitDeleted', handleSitDeleted as EventListener);
      window.removeEventListener('markUpdated', handleMarkUpdate as EventListener);
    };
  }, [map, user, hasMark]);

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