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

    // Load initial sits
    handleMoveEnd();

    // Add event listener
    map.on('moveend', handleMoveEnd);

    // Cleanup
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, loadNearbySits]);

  useEffect(() => {
    if (!map) return;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      console.log('MapContainer: Map clicked at:', e.lngLat);
      console.log('MapContainer: Target:', e.originalEvent.target);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [map]);

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