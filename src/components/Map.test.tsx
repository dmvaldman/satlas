// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MapComponent from './Map';
import { Markers } from './Markers';
import { Clusters } from './Clusters';
import mapboxgl from 'mapbox-gl';
import { Location, Sit, MarkType, User } from '../types'; // Adjust path as needed

// Mock mapboxgl library
vi.mock('mapbox-gl', () => {
  const Map = vi.fn(() => ({
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 0),
      getSouth: vi.fn(() => 0),
      getEast: vi.fn(() => 0),
      getWest: vi.fn(() => 0),
    })),
    getCenter: vi.fn(() => ({ lat: 34.0522, lng: -118.2437 })),
    getZoom: vi.fn(() => 10),
    flyTo: vi.fn(),
    setLayoutProperty: vi.fn(),
    queryRenderedFeatures: vi.fn(() => []),
    getSource: vi.fn(() => ({
        setData: vi.fn()
    })),
    isStyleLoaded: vi.fn(() => true), // Assume style is always loaded for simplicity
    isSourceLoaded: vi.fn(() => true), // Assume source is always loaded
    getStyle: vi.fn(() => ({ layers: [] })), // Mock getStyle to return an object with a layers array
  }));
  const Marker = vi.fn(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
    getElement: vi.fn(() => {
      const el = document.createElement('div');
      el.style.display = ''; // Initial display style
      return el;
    }),
  }));
  return { Map, Marker, accessToken: '' };
});

// Mock Markers and Clusters
vi.mock('./Markers', () => ({
  Markers: vi.fn().mockImplementation(() => ({
    showMarkers: vi.fn(),
    updateMarkersForClustering: vi.fn(),
    hideAllMarkers: vi.fn(),
    removeAllMarkers: vi.fn(), // If used internally by MapComponent
    updateMarker: vi.fn(),
    hasMarker: vi.fn(() => false),
  })),
}));

vi.mock('./Clusters', () => ({
  Clusters: vi.fn().mockImplementation(() => ({
    setupClusterLayer: vi.fn(),
    updateClusterSource: vi.fn(),
    areClusterLayersReady: vi.fn(() => true),
  })),
}));

const mockMapInstance = new mapboxgl.Map({ container: document.createElement('div') });

const mockDefaultProps = {
  map: mockMapInstance,
  sits: new Map<string, Sit>(),
  marks: new Map<string, Set<MarkType>>(),
  favoriteCount: new Map<string, number>(),
  user: null as User | null,
  currentLocation: { latitude: 34, longitude: -118 } as Location | null,
  seenSits: new Set<string>(),
  onLoadSits: vi.fn(),
  onOpenPopup: vi.fn(),
  isEditingLocation: false,
  onConfirmLocation: vi.fn(),
  onCancelLocationEdit: vi.fn(),
};

describe('Map.tsx', () => {
  let markerManagerInstance: Markers;
  let userMarkerInstance: mapboxgl.Marker;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-initialize mocks if they maintain state across tests
    markerManagerInstance = new Markers(vi.fn());
    // @ts-ignore
    MapComponent.prototype.markerManager = markerManagerInstance;

    // Mock userMarker directly on the prototype or instance for testing its interactions
    userMarkerInstance = new mapboxgl.Marker();
    // @ts-ignore
    MapComponent.prototype.userMarker = userMarkerInstance; 
  });

  describe('Scenario: isEditingLocation is true', () => {
    it('renders crosshair and buttons, hides markers/layers', () => {
      render(<MapComponent {...mockDefaultProps} isEditingLocation={true} />);

      expect(screen.getByText('+')).toBeInTheDocument(); // Crosshair
      expect(screen.getByRole('button', { name: /Confirm Location/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();

      // Check that markerManager.hideAllMarkers was called
      expect(markerManagerInstance.hideAllMarkers).toHaveBeenCalledWith(mockMapInstance);
      
      // Check userMarker visibility (if userMarker exists and was set up)
      // This requires the userMarker to be initialized in the component for this test path.
      // We're cheating a bit by accessing the prototype's userMarker.
      // A more robust way would be to ensure componentDidMount/Update sets it up.
      if (userMarkerInstance) {
         expect(userMarkerInstance.getElement().style.display).toBe('none');
      }

      // Check map layer visibility
      expect(mockMapInstance.setLayoutProperty).toHaveBeenCalledWith('clusters', 'visibility', 'none');
      expect(mockMapInstance.setLayoutProperty).toHaveBeenCalledWith('cluster-count', 'visibility', 'none');
      expect(mockMapInstance.setLayoutProperty).toHaveBeenCalledWith('unclustered-point', 'visibility', 'none');
    });
  });

  describe('Scenario: isEditingLocation transitions from true to false', () => {
    it('hides crosshair/buttons and restores markers/layers', () => {
      const { rerender } = render(<MapComponent {...mockDefaultProps} isEditingLocation={true} />);
      
      // Verify editing UI is visible
      expect(screen.getByText('+')).toBeInTheDocument();

      // Spy on updateVisibleMarkers before transitioning state
      const updateVisibleMarkersSpy = vi.spyOn(MapComponent.prototype as any, 'updateVisibleMarkers');

      rerender(<MapComponent {...mockDefaultProps} isEditingLocation={false} />);

      expect(screen.queryByText('+')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Confirm Location/i })).not.toBeInTheDocument();
      
      // Check that methods to restore visibility are called
      expect(updateVisibleMarkersSpy).toHaveBeenCalled();
      
      if (userMarkerInstance) {
        expect(userMarkerInstance.getElement().style.display).toBe(''); // Or whatever the default is
      }
      updateVisibleMarkersSpy.mockRestore();
    });
  });

  describe('Scenario: Click "Confirm Location"', () => {
    it('calls onConfirmLocation with map center', () => {
      const mockCenter = { lat: 35.123, lng: -119.456 };
      vi.mocked(mockMapInstance.getCenter).mockReturnValue(mockCenter);
      const onConfirmLocationMock = vi.fn();

      render(
        <MapComponent 
          {...mockDefaultProps} 
          isEditingLocation={true} 
          onConfirmLocation={onConfirmLocationMock} 
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Confirm Location/i }));

      expect(onConfirmLocationMock).toHaveBeenCalledWith({
        latitude: mockCenter.lat,
        longitude: mockCenter.lng,
      });
    });
  });

  describe('Scenario: Click "Cancel"', () => {
    it('calls onCancelLocationEdit', () => {
      const onCancelLocationEditMock = vi.fn();
      render(
        <MapComponent 
          {...mockDefaultProps} 
          isEditingLocation={true} 
          onCancelLocationEdit={onCancelLocationEditMock} 
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(onCancelLocationEditMock).toHaveBeenCalledTimes(1);
    });
  });
});
