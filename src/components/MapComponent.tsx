import React from 'react';
import mapboxgl from 'mapbox-gl';
import { debounce } from '../utils/debounce';
import { Sit, MarkType, User, Image } from '../types';
import { MarkerManager } from './MarkerManager';
import { ClusterManager } from './ClusterManager';

mapboxgl.accessToken = process.env.MAPBOX_ACCESS_TOKEN || '';

interface MapProps {
  map: mapboxgl.Map | null;
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
  user: User | null;
  currentLocation: { latitude: number; longitude: number } | null;
  onLoadSits: (bounds: { north: number; south: number }) => void;
  onLocationUpdate?: (location: { latitude: number; longitude: number }) => void;
  onOpenPopup: (sit: Sit) => void;
}

interface MapState {
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
}

class MapComponent extends React.Component<MapProps, MapState> {
  private markerManager: MarkerManager;
  private clusterManager: ClusterManager;
  private userMarker: mapboxgl.Marker | null = null;
  private debouncedHandleMapMove: (bounds: { north: number; south: number }) => void;

  constructor(props: MapProps) {
    super(props);
    this.state = {
      marks: new Map(props.marks),
      favoriteCount: new Map(props.favoriteCount)
    };

    this.markerManager = new MarkerManager(this.handleMarkerClick);

    this.clusterManager = new ClusterManager();

    this.debouncedHandleMapMove = debounce(this.props.onLoadSits, 300);
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
    const { map, sits, marks, favoriteCount, user, currentLocation } = this.props;

    // If props marks or favoriteCount changed, update state
    if (prevProps.marks !== marks) {
      this.setState({ marks: new Map(marks) }, () => {
        // After marks state is updated, refresh the markers
        this.updateVisibleMarkers();
      });
    }

    if (prevProps.favoriteCount !== favoriteCount) {
      this.setState({ favoriteCount: new Map(favoriteCount) });
    }

    // If user auth state changed, refresh markers
    if (prevProps.user !== user) {
      this.updateVisibleMarkers();
    }

    // If map is available and sits have changed, update the GeoJSON source
    if (map && prevProps.sits !== sits && this.clusterManager.isClusterSourceAdded()) {
      this.clusterManager.updateClusterSource(map, sits);
      this.updateVisibleMarkers();
    }

    // If map changed, setup the new map
    if (prevProps.map !== map && map) {
      this.setupMap(map);
    }

    // If current location changed, update user marker
    if (prevProps.currentLocation !== currentLocation && currentLocation && this.userMarker) {
      this.userMarker.setLngLat([currentLocation.longitude, currentLocation.latitude]);
    }
  }

  private setupMap(map: mapboxgl.Map) {
    // Setup map event handlers
    map.on('moveend', this.handleMapMove);

    // Setup cluster layer
    this.clusterManager.setupClusterLayer(map, this.props.sits);

    // Listen for zoom changes to update markers
    map.on('zoomend', this.updateVisibleMarkers);

    // Initial marker setup
    this.updateVisibleMarkers();
  }

  // Helper method to create the location dot element
  private createLocationDot(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'location-marker';
    return container;
  }

  // Update user location marker
  public updateUserLocation(location: { latitude: number; longitude: number }) {
    const { map } = this.props;

    if (!map) return;

    // Create user marker if it doesn't exist
    if (!this.userMarker) {
      this.userMarker = new mapboxgl.Marker({
        element: this.createLocationDot(),
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
      zoom: 15
    });
  }

  private handleMapMove = () => {
    const { map } = this.props;
    if (!map) return;
    const bounds = map.getBounds()!;
    this.debouncedHandleMapMove({
      north: bounds.getNorth(),
      south: bounds.getSouth()
    });
  };

  private handleMarkerClick = (sit: Sit) => {
    this.props.onOpenPopup(sit);
  };

  private updateVisibleMarkers = () => {
    const { map, sits, user } = this.props;
    const { marks } = this.state;
    if (!map || !this.clusterManager.isClusterSourceAdded()) return;

    // Check if cluster layers are ready before proceeding
    if (!this.clusterManager.areClusterLayersReady(map)) {
      // Cluster layers aren't ready yet, just show markers for now
      this.markerManager.showMarkers(map, sits, marks, user);
      return;
    }

    // Get current zoom level
    const zoom = map.getZoom();
    const clusterMaxZoom = 13; // Should match the value in ClusterManager

    // If zoomed in beyond clustering threshold, show individual markers
    if (zoom >= clusterMaxZoom) {
      // Hide cluster layers
      map.setLayoutProperty('clusters', 'visibility', 'none');
      map.setLayoutProperty('cluster-count', 'visibility', 'none');

      // Show individual markers
      this.markerManager.showMarkers(map, sits, marks, user);
    } else {
      // Show cluster layers
      map.setLayoutProperty('clusters', 'visibility', 'visible');
      map.setLayoutProperty('cluster-count', 'visibility', 'visible');

      // Get the IDs of points that are in clusters
      const clusteredFeatures = map.queryRenderedFeatures({ layers: ['clusters'] });
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

      // Show markers only for unclustered points
      this.markerManager.removeAllMarkers();
      if (unclusteredSits.size > 0) {
        this.markerManager.showMarkers(map, unclusteredSits, marks, user);
      }
    }
  };

  componentWillUnmount() {
    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
  }

  render() {
    return null;
  }
}

export default MapComponent;