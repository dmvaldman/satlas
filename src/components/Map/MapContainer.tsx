import { useEffect, useRef } from 'react';
import { useMap } from '../../contexts/MapContext';

export const MapContainer = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isLoading } = useMap();

  return (
    <div id="map-container" ref={containerRef}>
      {isLoading && (
        <div className="map-loading">
          <p>Loading map...</p>
        </div>
      )}
    </div>
  );
};