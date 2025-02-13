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

    if (user && sit.uploadedBy === user.uid) {
      classes.push('own-sit');
    }

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
    mapboxMarkers.forEach(marker => marker.remove());
    mapboxMarkers.clear();
    sits.forEach(sit => createMarker(sit));
  };

  const getMarker = (id: string) => mapboxMarkers.get(id);

  const updateMarkerStyle = (sitId: string, classes: string[]) => {
    const marker = mapboxMarkers.get(sitId);
    if (marker) {
      const el = marker.getElement();
      // Remove our custom classes only
      el.classList.remove('satlas-marker', 'own-sit', 'favorite');
      // Add our custom classes if present in the passed classes
      classes.forEach(c => {
        if (['satlas-marker', 'own-sit', 'favorite'].includes(c)) {
          el.classList.add(c);
        }
      });
    }
  };

  // Combined effect: handles initial marker loading and subsequent updates
  useEffect(() => {
    if (!map || !marksLoaded) return;

    const refreshMarkers = async () => {
      let markerData;
      // If no sits have been loaded yet, fetch them from the current map bounds
      if (sits.size === 0) {
        try {
          const bounds = map.getBounds();
          markerData = await loadNearbySits({
            north: bounds.getNorth(),
            south: bounds.getSouth()
          });
        } catch (error) {
          console.error('Error loading initial sits:', error);
          return;
        }
      } else {
        markerData = Array.from(sits.values());
      }

      // Load (or reload) markers from the marker data
      loadMarkers(markerData);

      // Update marker styling based on current auth and favorites state
      mapboxMarkers.forEach((marker, sitId) => {
        const customClasses = ['satlas-marker'];
        const sit = sits.get(sitId);
        if (sit) {
          if (user && sit.uploadedBy === user.uid) {
            customClasses.push('own-sit');
          }
          if (hasMark(sitId, 'favorite')) {
            customClasses.push('favorite');
          }
        }
        updateMarkerStyle(sitId, customClasses);
      });
    };

    refreshMarkers();
  }, [map, marksLoaded, sits, user, loadNearbySits, hasMark]);

  // Listen for sit deleted and mark updates
  useEffect(() => {
    const handleSitDeleted = (e: CustomEvent<{ sitId: string }>) => {
      deleteMarker(e.detail.sitId);
    };

    const handleMarkUpdate = (e: CustomEvent<{
      sitId: string;
      type: MarkType;
      isActive: boolean;
      userId: string;
    }>) => {
      const marker = mapboxMarkers.get(e.detail.sitId);
      if (!marker) return;

      const el = marker.getElement();
      const classes = ['satlas-marker'];

      if (e.detail.userId === user?.uid) {
        classes.push('own-sit');
      }
      if (e.detail.type === 'favorite' && e.detail.isActive) {
        classes.push('favorite');
      }

      updateMarkerStyle(e.detail.sitId, classes);
    };

    window.addEventListener('sitDeleted', handleSitDeleted as EventListener);
    window.addEventListener('markUpdated', handleMarkUpdate as EventListener);

    return () => {
      window.removeEventListener('sitDeleted', handleSitDeleted as EventListener);
      window.removeEventListener('markUpdated', handleMarkUpdate as EventListener);
    };
  }, [user]);

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