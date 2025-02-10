import { useEffect, useRef, useState } from 'react';
import { useMap } from '../../contexts/MapContext';
import { useSits } from '../../contexts/SitsContext';
import { AddSitButton } from './AddSitButton';

export const MapContainer = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, isLoading: isMapLoading } = useMap();
  const { loadNearbySits } = useSits();
  const [isLoadingSits, setIsLoadingSits] = useState(false);

  useEffect(() => {
    if (!map) return;

    const handleMoveEnd = async () => {
      const bounds = map.getBounds();
      setIsLoadingSits(true);
      try {
        await loadNearbySits({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          // Note: We're not using east/west bounds yet due to Firestore query limitations
          // We'll need to handle this in the application layer
        });
      } catch (error) {
        console.error('Error loading sits:', error);
      } finally {
        setIsLoadingSits(false);
      }
    };

    // Load initial sits
    handleMoveEnd();

    // Add event listener
    map.on('moveend', handleMoveEnd);

    // Cleanup
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, loadNearbySits]);

  return (
    <>
      <div id="map-container" ref={containerRef}>
        {(isMapLoading || isLoadingSits) && (
          <div className="map-loading">
            <p>{isMapLoading ? 'Loading map...' : 'Loading sits...'}</p>
          </div>
        )}
      </div>
      <AddSitButton />
    </>
  );
};