import React from 'react';
import mapboxgl from 'mapbox-gl';
import { debounce } from '../utils/debounce';
import { Sit, MarkType, User, Image } from '../types';
import { MarkerManager } from './MarkerManager';
import { PopupManager } from './PopupManager';
import { ClusterManager } from './ClusterManager';

mapboxgl.accessToken = process.env.MAPBOX_ACCESS_TOKEN || '';

interface MapProps {
  map: mapboxgl.Map | null;
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
  user: User | null;
  isLoading: boolean;
  currentLocation: { latitude: number; longitude: number } | null;
  onLoadNearbySits: (bounds: { north: number; south: number }) => void;
  onToggleMark: (sitId: string, type: MarkType) => Promise<void>;
  onDeleteImage: (sitId: string, imageId: string) => Promise<void>;
  onReplaceImage: (sitId: string, imageId: string) => void;
  onOpenPhotoModal: (sit: Sit) => void;
  onOpenProfileModal: () => void;
  getImagesForSit: (imageCollectionId: string) => Promise<Image[]>;
  onOpenFullScreenCarousel: (images: Image[], initialIndex: number) => void;
  onLocationUpdate?: (location: { latitude: number; longitude: number }) => void;
}

interface MapState {
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
}

class MapComponent extends React.Component<MapProps, MapState> {
  private markerManager: MarkerManager;
  private popupManager: PopupManager;
  private clusterManager: ClusterManager;
  private debouncedHandleMapMove: (bounds: { north: number; south: number }) => void;
  private userMarker: mapboxgl.Marker | null = null;

  constructor(props: MapProps) {
    super(props);
    this.state = {
      marks: new Map(props.marks),
      favoriteCount: new Map(props.favoriteCount)
    };

    this.markerManager = new MarkerManager(this.handleMarkerClick);
    this.popupManager = new PopupManager(
      this.handleToggleMark,
      props.onDeleteImage,
      this.handleReplaceImage,
      props.onOpenPhotoModal,
      props.onOpenProfileModal,
      props.getImagesForSit,
      props.onOpenFullScreenCarousel
    );
    this.clusterManager = new ClusterManager();

    this.debouncedHandleMapMove = debounce(
      (bounds: { north: number; south: number }) => {
        this.props.onLoadNearbySits(bounds);
      },
      500 // Wait 500ms after the last move event before loading sits
    );
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

    // Initial marker setup
    this.updateVisibleMarkers();
  }

  // Helper method to create the location dot element
  private createLocationDot(): HTMLElement {
    // Create a simple container with the right class
    const container = document.createElement('div');
    container.className = 'custom-location-marker';
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

  private handleMarkerClick = async (sit: Sit) => {
    const { map, user, currentLocation } = this.props;
    const { marks, favoriteCount } = this.state;
    if (!map) return;

    // Check if clicked marker is the currently open one
    if (this.popupManager.getCurrentSitId() === sit.id) {
      this.popupManager.closePopup();
      return;
    }

    await this.popupManager.showPopup(
      map,
      sit,
      user,
      marks.get(sit.id) || new Set(),
      favoriteCount.get(sit.id) || 0,
      currentLocation
    );
  };

  private handleReplaceImage = (sitId: string, imageId: string) => {
    this.props.onOpenPhotoModal(this.props.sits.get(sitId)!);
  };

  private handleToggleMark = async (sitId: string, type: MarkType) => {
    // Get current state
    const { marks, favoriteCount } = this.state;

    // Get current marks for this sit
    const currentMarks = new Set(marks.get(sitId) || new Set<MarkType>());
    const currentFavoriteCount = favoriteCount.get(sitId) || 0;

    // Create new marks set - start with an empty set to match MarksManager behavior
    const newMarks = new Set<MarkType>();
    let newFavoriteCount = currentFavoriteCount;

    // If the mark was already active, we're removing it
    if (currentMarks.has(type)) {
      // Just leave newMarks empty
      if (type === 'favorite') {
        newFavoriteCount = Math.max(0, currentFavoriteCount - 1);
      }
    } else {
      // Add only the new mark type (clearing others)
      newMarks.add(type);

      // Update favorite count if needed
      if (type === 'favorite') {
        newFavoriteCount++;
      } else if (currentMarks.has('favorite')) {
        // If we're switching from favorite to another type, decrement favorite count
        newFavoriteCount = Math.max(0, currentFavoriteCount - 1);
      }
    }

    // Update state immediately
    const updatedMarks = new Map(marks);
    updatedMarks.set(sitId, newMarks);

    const updatedFavoriteCount = new Map(favoriteCount);
    updatedFavoriteCount.set(sitId, newFavoriteCount);

    this.setState({
      marks: updatedMarks,
      favoriteCount: updatedFavoriteCount
    });

    // Update the marker styling directly
    const sit = this.props.sits.get(sitId);
    if (sit) {
      this.markerManager.updateMarker(sitId, sit, newMarks, this.props.user);

      // Update the popup if it's for this sit
      this.popupManager.updatePopup(
        sit,
        this.props.user,
        newMarks,
        newFavoriteCount,
        this.props.currentLocation
      );
    }

    // Make the actual API call
    try {
      await this.props.onToggleMark(sitId, type);
      // Server update successful, state will be updated via props in componentDidUpdate
    } catch (error) {
      console.error('Error toggling mark:', error);

      // On error, revert to previous state
      const revertedMarks = new Map(this.state.marks);
      revertedMarks.set(sitId, currentMarks);

      const revertedFavoriteCount = new Map(this.state.favoriteCount);
      revertedFavoriteCount.set(sitId, currentFavoriteCount);

      this.setState({
        marks: revertedMarks,
        favoriteCount: revertedFavoriteCount
      });

      // Also update the marker and popup with reverted state
      if (sit) {
        this.markerManager.updateMarker(sitId, sit, currentMarks, this.props.user);

        this.popupManager.updatePopup(
          sit,
          this.props.user,
          currentMarks,
          currentFavoriteCount,
          this.props.currentLocation
        );
      }
    }
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

  public closePopup = () => {
    this.popupManager.closePopup()
  };

  componentWillUnmount() {
    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
  }

  render() {
    const { isLoading } = this.props;

    if (isLoading) {
      return (
        <div className="loading">
          <p>Loading map...</p>
        </div>
      );
    }

    return null;
  }
}

export default MapComponent;