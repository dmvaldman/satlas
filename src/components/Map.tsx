import React from 'react';
import mapboxgl from 'mapbox-gl';
import { debounce } from '../utils/debounce';
import { Sit, MarkType, User, Location } from '../types';
import { Markers } from './Markers';
import { Clusters } from './Clusters';

mapboxgl.accessToken = process.env.MAPBOX_ACCESS_TOKEN || '';

interface MapProps {
  map: mapboxgl.Map | null;
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
  user: User | null;
  currentLocation: Location | null;
  seenSits: Set<string>;
  onLoadSits: (bounds: { north: number; south: number }) => void;
  onLocationUpdate?: (location: Location) => void;
  onOpenPopup: (sit: Sit) => void;
  isEditingLocation?: boolean; // New prop
  onConfirmLocation?: (location: Location) => void; // New prop
  onCancelLocationEdit?: () => void; // New prop
}

interface MapState {
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
  // Storing previous visibility state might be complex due to dynamic updates.
  // Instead, we'll rely on re-evaluating visibility when editing mode ends.
}

class MapComponent extends React.Component<MapProps, MapState> {
  private markerManager: Markers;
  private clusterManager: Clusters;
  private userMarker: mapboxgl.Marker | null = null;

  constructor(props: MapProps) {
    super(props);
    this.state = {
      marks: new Map(props.marks),
      favoriteCount: new Map(props.favoriteCount)
    };

    this.markerManager = new Markers(this.handleMarkerClick);

    this.clusterManager = new Clusters();
  }

  componentDidMount() {
    const { map, currentLocation } = this.props;
    if (map) {
      this.setupMap(map);

      // Initialize user marker if we have a location
      if (currentLocation) {
        this.updateUserLocation(currentLocation);
      }
    }
  }

  componentDidUpdate(prevProps: MapProps) {
    const { map, sits, marks, favoriteCount, user, currentLocation, isEditingLocation } = this.props;

    // Handle location editing mode changes
    if (prevProps.isEditingLocation !== isEditingLocation && map) {
      if (isEditingLocation) {
        this.showLocationEditingUI(map);
      } else {
        this.hideLocationEditingUI(map);
      }
    }

    // If not in editing mode, proceed with normal updates
    if (!isEditingLocation) {
      if (prevProps.marks !== marks) {
        this.setState({ marks: new Map(marks) }, () => {
          this.updateVisibleMarkers();
        });
      }

      if (prevProps.favoriteCount !== favoriteCount) {
        this.setState({ favoriteCount: new Map(favoriteCount) });
      }

      if (prevProps.user !== user) {
        this.updateVisibleMarkers();
      }

      if (map && prevProps.sits !== sits && this.clusterManager.areClusterLayersReady(map)) {
        this.clusterManager.updateClusterSource(map, sits);
        this.updateVisibleMarkers();
      }

      if (prevProps.map !== map && map) {
        this.setupMap(map); // This will also call updateUserLocation if needed
      }

      if (prevProps.currentLocation !== currentLocation && currentLocation && this.userMarker) {
        this.userMarker.setLngLat([currentLocation.longitude, currentLocation.latitude]);
        // Ensure user marker is visible if it was hidden during editing
        if(this.userMarker?.getElement().style.display === 'none') {
            this.userMarker.getElement().style.display = '';
        }
      }
    } else {
      // While editing, if the map instance itself changes (e.g. re-created), re-apply editing UI
      if (prevProps.map !== map && map) {
          this.setupMap(map); // Basic setup
          this.showLocationEditingUI(map); // Re-apply editing UI to new map instance
      }
    }
  }

  private showLocationEditingUI(map: mapboxgl.Map) {
    console.log('[MapComponent] Entering location editing mode.');
    // Hide sit markers (markerManager needs a method for this, or iterate and hide)
    this.markerManager.hideAllMarkers(map); // Assuming this method exists or will be added

    // Hide user marker
    if (this.userMarker) {
      this.userMarker.getElement().style.display = 'none';
    }

    // Hide cluster layers
    if (this.clusterManager.areClusterLayersReady(map)) {
      map.setLayoutProperty('clusters', 'visibility', 'none');
      map.setLayoutProperty('cluster-count', 'visibility', 'none');
      map.setLayoutProperty('unclustered-point', 'visibility', 'none');
    }
    // Crosshair and buttons are rendered conditionally via render() method
  }

  private hideLocationEditingUI(map: mapboxgl.Map) {
    console.log('[MapComponent] Exiting location editing mode.');
    // Show user marker
    if (this.userMarker) {
      this.userMarker.getElement().style.display = '';
    }

    // Restore cluster layers (visibility will be handled by updateVisibleMarkers)
    if (this.clusterManager.areClusterLayersReady(map)) {
        // No need to explicitly set to visible here, updateVisibleMarkers will handle it
    }
    
    // Re-show sit markers and update cluster visibility based on zoom
    this.updateVisibleMarkers();
    // Crosshair and buttons are rendered conditionally via render() method
  }

  private setupMap(map: mapboxgl.Map) {
    // Setup map event handlers
    map.on('move', debounce(this.loadSits.bind(this), 200));
    // map.on('moveend', this.loadSits.bind(this));

    // Setup cluster layer
    this.clusterManager.setupClusterLayer(map, this.props.sits);

    // Listen for zoom changes to update markers
    map.on('zoomend', this.updateVisibleMarkers);

    // Initial marker setup
    this.updateVisibleMarkers();
  }

  private createLocationMarker(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'location-marker';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    const markerColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--location-marker-color')
      .trim();

    path.setAttribute('fill', markerColor);
    path.setAttribute('stroke', 'black');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('d', 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z');

    svg.appendChild(path);
    container.appendChild(svg);
    return container;
  }

  // Update user location marker
  public updateUserLocation(location: Location) {
    const { map } = this.props;

    if (!map) return;

    // Create user marker if it doesn't exist
    if (!this.userMarker) {
      this.userMarker = new mapboxgl.Marker({
        element: this.createLocationMarker(),
        anchor: 'center'
      })
      .setLngLat([location.longitude, location.latitude])
      .addTo(map);
    } else {
      // Update existing marker
      this.userMarker.setLngLat([location.longitude, location.latitude]);
    }

    // Notify parent component if callback exists
    if (this.props.onLocationUpdate) {
      this.props.onLocationUpdate(location);
    }
  }

  // Center map on user location
  public centerOnUserLocation() {
    const { map, currentLocation } = this.props;

    if (!map || !currentLocation) return;

    map.flyTo({
      center: [currentLocation.longitude, currentLocation.latitude],
      zoom: 15,
      duration: 1000,
      essential: true
    });
  }

  private loadSits = () => {
    const { map, onLoadSits } = this.props;
    if (!map) return;
    const bounds = map.getBounds()!;
    onLoadSits({
      north: bounds.getNorth(),
      south: bounds.getSouth()
    });
  };

  private handleMarkerClick = (sit: Sit) => {
    this.props.onOpenPopup(sit);
  };

  private updateVisibleMarkers = () => {
    const { map, sits, user, seenSits } = this.props;
    const { marks } = this.state;
    if (!map) return;

    // Check if cluster layers are ready before proceeding
    if (!this.clusterManager.areClusterLayersReady(map)) {
      // Cluster layers aren't ready yet, just show markers for now
      this.markerManager.showMarkers(map, sits, marks, user, seenSits);
      return;
    }

    // Get current zoom level
    const zoom = map.getZoom();
    const clusterMaxZoom = 13;

    // If zoomed in beyond clustering threshold, show individual markers
    if (zoom >= clusterMaxZoom) {
      // Hide cluster layers
      map.setLayoutProperty('clusters', 'visibility', 'none');
      map.setLayoutProperty('cluster-count', 'visibility', 'none');

      // Show all markers
      this.markerManager.showMarkers(map, sits, marks, user, seenSits);
    } else {
      // Show cluster layers
      map.setLayoutProperty('clusters', 'visibility', 'visible');
      map.setLayoutProperty('cluster-count', 'visibility', 'visible');

      // Get the IDs of points that are in clusters
      const unclusteredFeatures = map.queryRenderedFeatures({ layers: ['unclustered-point'] });

      // Extract the sit IDs from unclustered features
      const unclusteredIds = new Set(
        unclusteredFeatures
          .map(feature => feature.properties?.id)
          .filter(id => id != null)
      );

      // Create a map of only the unclustered sits
      const unclusteredSits = new Map(
        Array.from(sits.entries())
          .filter(([id]) => unclusteredIds.has(id))
      );

      // Update markers to only show unclustered points
      this.markerManager.updateMarkersForClustering(map, unclusteredSits, marks, user, seenSits);
    }
  };

  componentWillUnmount() {
    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
  }

  render() {
    const { isEditingLocation, map } = this.props;

    // Styles for crosshair and buttons (can be moved to CSS)
    const crosshairStyle: React.CSSProperties = {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      fontSize: '24px',
      color: 'red',
      pointerEvents: 'none', // So it doesn't interfere with map interactions
      zIndex: 1000, // Ensure it's above the map but below modal controls if any
    };

    const buttonContainerStyle: React.CSSProperties = {
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '10px',
      zIndex: 1000,
    };

    const buttonStyle: React.CSSProperties = {
      padding: '10px 15px',
      fontSize: '16px',
      cursor: 'pointer',
    };

    return (
      <>
        {isEditingLocation && (
          <>
            <div style={crosshairStyle}>+</div>
            <div style={buttonContainerStyle}>
              <button
                style={buttonStyle}
                onClick={() => {
                  if (map && this.props.onConfirmLocation) {
                    const center = map.getCenter();
                    this.props.onConfirmLocation({
                      latitude: center.lat,
                      longitude: center.lng,
                    });
                  }
                }}
              >
                Confirm Location
              </button>
              <button
                style={{...buttonStyle, backgroundColor: '#ccc' }}
                onClick={() => {
                  if (this.props.onCancelLocationEdit) {
                    this.props.onCancelLocationEdit();
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
        {/* The map container itself is managed by the parent, this component renders overlays */}
      </>
    );
  }
}

export default MapComponent;