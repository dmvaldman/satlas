import { useEffect } from 'react';
import { useMap } from '../../contexts/MapContext';
import { useSits } from '../../contexts/SitsContext';
import { AddSitButton } from './AddSitButton';

export const MapContainer = () => {
  const { map, isLoading } = useMap();
  const { loadNearbySits } = useSits();

  // Add effect to load sits when map moves
  useEffect(() => {
    if (!map) return;

    const handleMoveEnd = async () => {
      const bounds = map.getBounds();
      try {
        await loadNearbySits({
          north: bounds.getNorth(),
          south: bounds.getSouth()
        });
      } catch (error) {
        console.error('Error loading sits:', error);
      }
    };

    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, loadNearbySits]);

  return (
    <>
      <div id="map-container" />
      {isLoading && (
        <div className="map-loading">
          <p>Loading map...</p>
        </div>
      )}
      <AddSitButton />
    </>
  );
};