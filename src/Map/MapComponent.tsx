import React from 'react';
import mapboxgl from 'mapbox-gl';
import { Sit, MarkType, User, Image } from '../types';
import MarkerComponent from './Marker';
import { createRoot } from 'react-dom/client';
import PopupComponent from './Popup';
import { debounce } from '../utils/debounce';

mapboxgl.accessToken = 'pk.eyJ1IjoiZG12YWxkbWFuIiwiYSI6ImNpbXRmNXpjaTAxem92OWtrcHkxcTduaHEifQ.6sfBuE2sOf5bVUU6cQJLVQ';

interface MapProps {
  map: mapboxgl.Map | null;
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
  currentLocation: { latitude: number; longitude: number } | null;
  isLoading: boolean;
  user: User | null;
  onSitClick: (sit: Sit) => void;
  onLoadNearbySits: (bounds: { north: number; south: number }) => Promise<void>;
  onToggleMark: (sitId: string, type: MarkType) => Promise<void>;
  onDeleteImage: (sitId: string, imageId: string) => Promise<void>;
  onReplaceImage: (sitId: string, imageId: string) => void;
  getImagesForSit: (imageCollectionId: string) => Promise<Image[]>;
  onOpenPhotoModal: (sit?: Sit) => void;
  onOpenProfileModal: () => void;
}

interface MapState {
  activePopup: mapboxgl.Popup | null;
  clusterSourceAdded: boolean;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
}

class MapComponent extends React.Component<MapProps, MapState> {
  private debouncedHandleMapMove: (bounds: { north: number; south: number }) => void;
  private popupRoot: any = null;
  private popupContainer: HTMLElement | null = null;
  private currentPopupSitId: string | null = null;
  private currentPopupImages: Image[] = [];
  private markers: Map<string, mapboxgl.Marker> = new Map();
  private clusterMarkers: Map<number, mapboxgl.Marker> = new Map();

  constructor(props: MapProps) {
    super(props);
    this.state = {
      activePopup: null,
      clusterSourceAdded: false,
      marks: new Map(props.marks),
      favoriteCount: new Map(props.favoriteCount)
    };

    // Create debounced version of handleMapMove
    this.debouncedHandleMapMove = debounce(
      (bounds: { north: number; south: number }) => {
        this.props.onLoadNearbySits(bounds);
      },
      500 // Wait 500ms after the last move event before loading sits
    );
  }

  componentDidMount() {
    console.log('MapComponent mounted');
    const { map } = this.props;
    if (map) {
      this.setupMapListeners(map);
      this.setupClusterLayer(map);
    }
  }

  componentWillUnmount() {
    const { map } = this.props;
    if (map) {
      map.off('moveend', this.handleMapMove);
      map.off('click', 'clusters', this.handleClusterClick);

      // Remove all markers
      this.markers.forEach(marker => marker.remove());
      this.clusterMarkers.forEach(marker => marker.remove());
    }

    if (this.state.activePopup) {
      this.state.activePopup.remove();
    }
  }

  private setupMapListeners(map: mapboxgl.Map) {
    console.log('Setting up map listeners');
    map.on('moveend', this.handleMapMove);
  }

  private handleMapMove = async () => {
    console.log('Map moved');
    const { map } = this.props;
    if (!map) return;

    const bounds = map.getBounds();
    if (bounds) {
      this.debouncedHandleMapMove({
        north: bounds.getNorth(),
        south: bounds.getSouth()
      });
    }
  };

  private handleMarkerClick = async (sit: Sit) => {
    const { map, user } = this.props;
    const { marks, favoriteCount } = this.state;
    if (!map) return;

    if (this.state.activePopup) {
      this.state.activePopup.remove();
    }

    const container = document.createElement('div');
    this.popupContainer = container;
    this.popupRoot = createRoot(container);
    this.currentPopupSitId = sit.id;

    try {
      const images = sit.imageCollectionId
        ? await this.props.getImagesForSit(sit.imageCollectionId)
        : [];
      // Store images so that future re-renders preserve them
      this.currentPopupImages = images;

      this.popupRoot.render(
        <PopupComponent
          sit={sit}
          images={images}
          user={user}
          marks={marks.get(sit.id) || new Set()}
          favoriteCount={favoriteCount.get(sit.id) || 0}
          onToggleMark={this.handleToggleMark}
          onDeleteImage={this.props.onDeleteImage}
          onReplaceImage={this.handleReplaceImage}
          onOpenPhotoModal={this.props.onOpenPhotoModal}
          onOpenProfileModal={this.props.onOpenProfileModal}
          currentLocation={this.props.currentLocation}
        />
      );

      const popup = new mapboxgl.Popup({
        closeButton: false,
        maxWidth: '300px',
        offset: 25,
        anchor: 'bottom',
        className: 'satlas-popup-container'
      });

      popup.setDOMContent(container)
           .setLngLat([sit.location.longitude, sit.location.latitude])
           .addTo(map);

      this.setState({ activePopup: popup });
    } catch (error) {
      console.error('Error loading popup content:', error);
    }
  };

  componentDidUpdate(prevProps: MapProps) {
    // If props marks or favoriteCount changed, update state
    if (prevProps.marks !== this.props.marks) {
      this.setState({ marks: new Map(this.props.marks) });
    }

    if (prevProps.favoriteCount !== this.props.favoriteCount) {
      this.setState({ favoriteCount: new Map(this.props.favoriteCount) });
    }

    const { map, sits } = this.props;

    // If map is available and sits have changed, update the GeoJSON source
    if (map && prevProps.sits !== sits && this.state.clusterSourceAdded) {
      this.updateClusterSource(map, sits);
    }

    // If marks have changed, update all visible markers
    if (prevProps.marks !== this.props.marks && map) {
      this.markers.forEach((marker, sitId) => {
        const sit = this.props.sits.get(sitId);
        if (sit) {
          const el = marker.getElement();
          el.className = 'mapboxgl-marker';
          this.getMarkerClasses(sit, this.props.user, this.props.marks.get(sitId) || new Set())
            .forEach(className => {
              el.classList.add(className);
            });
        }
      });
    }
  }

  private handleReplaceImage = (sitId: string, imageId: string) => {
    this.props.onOpenPhotoModal();
  };

  private handleToggleMark = async (sitId: string, type: MarkType) => {
    // Get current state
    const { marks, favoriteCount } = this.state;

    // Get current marks for this sit
    const currentMarks = new Set(marks.get(sitId) || new Set());
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
    if (this.markers.has(sitId)) {
      const sit = this.props.sits.get(sitId);
      if (sit) {
        const marker = this.markers.get(sitId)!;
        const el = marker.getElement();
        el.className = 'mapboxgl-marker';
        this.getMarkerClasses(sit, this.props.user, newMarks).forEach(className => {
          el.classList.add(className);
        });
      }
    }

    // Update the popup if it's for this sit
    if (this.popupRoot && this.currentPopupSitId === sitId) {
      const sit = this.props.sits.get(sitId);
      if (sit) {
        this.popupRoot.render(
          <PopupComponent
            sit={sit}
            images={this.currentPopupImages}
            user={this.props.user}
            marks={newMarks}
            favoriteCount={newFavoriteCount}
            onToggleMark={this.handleToggleMark}
            onDeleteImage={this.props.onDeleteImage}
            onReplaceImage={this.handleReplaceImage}
            onOpenPhotoModal={this.props.onOpenPhotoModal}
            onOpenProfileModal={this.props.onOpenProfileModal}
            currentLocation={this.props.currentLocation}
          />
        );
      }
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

      // Also update the marker styling directly
      if (this.markers.has(sitId)) {
        const sit = this.props.sits.get(sitId);
        if (sit) {
          const marker = this.markers.get(sitId)!;
          const el = marker.getElement();
          el.className = 'mapboxgl-marker';
          this.getMarkerClasses(sit, this.props.user, currentMarks).forEach(className => {
            el.classList.add(className);
          });
        }
      }

      // Also update the popup with reverted state
      if (this.popupRoot && this.currentPopupSitId === sitId) {
        const sit = this.props.sits.get(sitId);
        if (sit) {
          this.popupRoot.render(
            <PopupComponent
              sit={sit}
              images={this.currentPopupImages}
              user={this.props.user}
              marks={currentMarks}
              favoriteCount={currentFavoriteCount}
              onToggleMark={this.handleToggleMark}
              onDeleteImage={this.props.onDeleteImage}
              onReplaceImage={this.handleReplaceImage}
              onOpenPhotoModal={this.props.onOpenPhotoModal}
              onOpenProfileModal={this.props.onOpenProfileModal}
              currentLocation={this.props.currentLocation}
            />
          );
        }
      }
    }
  };

  private setupClusterLayer(map: mapboxgl.Map) {
    // Check if the map is already loaded
    if (map.loaded()) {
      this.initializeClusterLayers(map);
    } else {
      // If not loaded yet, wait for the load event
      map.on('load', () => {
        this.initializeClusterLayers(map);
      });
    }
  }

  private initializeClusterLayers(map: mapboxgl.Map) {
    // Add a new source from our GeoJSON data
    map.addSource('sits', {
      type: 'geojson',
      data: this.createGeoJSONFromSits(this.props.sits),
      cluster: true,
      clusterMaxZoom: 13, // Max zoom to cluster points on
      clusterMinPoints: 2, // Minimum points to form a cluster
      clusterRadius: 50 // Radius of each cluster when clustering points
    });

    // Add a layer for the clusters
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'sits',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#51bbd6', // color for clusters with < 10 points
          10,
          '#f1f075', // color for clusters with < 50 points
          50,
          '#f28cb1' // color for clusters with >= 50 points
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          20, // radius for clusters with < 10 points
          10,
          30, // radius for clusters with < 50 points
          50,
          40 // radius for clusters with >= 50 points
        ]
      }
    });

    // Add a layer for the cluster count labels
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'sits',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12
      },
      paint: {
        'text-color': '#ffffff'
      }
    });

    // Add a layer for unclustered points (we'll hide this and use our custom markers)
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'sits',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': 'rgba(0, 0, 0, 0)', // Transparent
        'circle-radius': 0, // Size 0 to hide
        'circle-stroke-width': 0
      }
    });

    // Set state to indicate the cluster source is added
    this.setState({ clusterSourceAdded: true });

    // Add click handler for clusters
    map.on('click', 'clusters', this.handleClusterClick);

    // Change cursor when hovering over clusters
    map.on('mouseenter', 'clusters', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'clusters', () => {
      map.getCanvas().style.cursor = '';
    });

    // Listen for zoom changes to update markers
    map.on('zoomend', this.updateVisibleMarkers);

    // Initial update of markers
    this.updateVisibleMarkers();
  }

  private createGeoJSONFromSits(sits: Map<string, Sit>) {
    const features = Array.from(sits.values()).map(sit => ({
      type: 'Feature' as const,
      properties: {
        id: sit.id,
        // Include any other properties you want to access in the cluster
        uploadedBy: sit.uploadedBy
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [sit.location.longitude, sit.location.latitude]
      }
    }));

    return {
      type: 'FeatureCollection' as const,
      features
    };
  }

  private updateClusterSource(map: mapboxgl.Map, sits: Map<string, Sit>) {
    const source = map.getSource('sits') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(this.createGeoJSONFromSits(sits));
      this.updateVisibleMarkers();
    }
  }

  private handleClusterClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
    const { map } = this.props;
    if (!map || !e.features) return;

    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (!features.length) return;

    const clusterId = features[0].properties?.cluster_id;
    if (clusterId === undefined) return;

    // Get the cluster source
    const source = map.getSource('sits') as mapboxgl.GeoJSONSource;

    // Get the cluster expansion zoom
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err || zoom === undefined) return;

      // Center the map on the cluster and zoom in
      map.easeTo({
        center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
        zoom: zoom
      });
    });
  };

  private updateVisibleMarkers = () => {
    const { map, sits, marks, user } = this.props;
    if (!map || !this.state.clusterSourceAdded) return;

    // Get current zoom level
    const zoom = map.getZoom();
    const clusterMaxZoom = 13; // Should match the value in setupClusterLayer

    // If zoomed in beyond clustering threshold, show individual markers
    if (zoom >= clusterMaxZoom) {
      // Hide cluster layers
      map.setLayoutProperty('clusters', 'visibility', 'none');
      map.setLayoutProperty('cluster-count', 'visibility', 'none');

      // Show individual markers
      this.showIndividualMarkers(map, sits, marks, user);
    } else {
      // Show cluster layers
      map.setLayoutProperty('clusters', 'visibility', 'visible');
      map.setLayoutProperty('cluster-count', 'visibility', 'visible');

      // Check if there are any clusters in the current view
      const features = map.queryRenderedFeatures({ layers: ['clusters'] });

      // If no clusters are found but we're just below the threshold, keep individual markers
      if (features.length === 0 && zoom > clusterMaxZoom - 0.5) {
        this.showIndividualMarkers(map, sits, marks, user);
      } else {
        // Hide individual markers
        this.markers.forEach(marker => {
          marker.remove();
        });
      }
    }
  };

  private showIndividualMarkers(map: mapboxgl.Map, sits: Map<string, Sit>, marks: Map<string, Set<MarkType>>, user: User | null) {
    // Use component state for marks
    const stateMarks = this.state.marks;

    Array.from(sits.values()).forEach(sit => {
      // Get marks from state
      const sitMarks = stateMarks.get(sit.id) || new Set();

      // Check if marker already exists
      if (!this.markers.has(sit.id)) {
        // Create new marker
        const el = document.createElement('div');
        el.className = this.getMarkerClasses(sit, user, sitMarks).join(' ');
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleMarkerClick(sit);
        });

        const marker = new mapboxgl.Marker(el)
          .setLngLat([sit.location.longitude, sit.location.latitude])
          .addTo(map);

        this.markers.set(sit.id, marker);
      } else {
        // Update existing marker
        const marker = this.markers.get(sit.id)!;
        const el = marker.getElement();

        // Update classes
        el.className = 'mapboxgl-marker';
        this.getMarkerClasses(sit, user, sitMarks).forEach(className => {
          el.classList.add(className);
        });

        // Update position if needed
        marker.setLngLat([sit.location.longitude, sit.location.latitude]);

        // Make sure the marker is visible and added to the map
        marker.addTo(map);
      }
    });

    // Remove any markers that no longer exist
    this.markers.forEach((marker, id) => {
      if (!sits.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    });

    // Remove any cluster markers
    this.clusterMarkers.forEach(marker => marker.remove());
    this.clusterMarkers.clear();
  }

  private getMarkerClasses(sit: Sit, user: User | null, marks: Set<MarkType>): string[] {
    const classes = ['satlas-marker'];

    if (user && sit.uploadedBy && sit.uploadedBy === user.uid) {
      classes.push('own-sit');
    }

    if (marks.has('favorite')) {
      classes.push('favorite');
    }

    if (marks.has('visited')) {
      classes.push('visited');
    }

    if (marks.has('wantToGo')) {
      classes.push('want-to-go');
    }

    return classes;
  }

  render() {
    const { map, sits, isLoading } = this.props;

    if (isLoading) {
      return (
        <div className="loading">
          <p>Loading map...</p>
        </div>
      );
    }

    // We're now handling markers directly in the component
    return null;
  }
}

export default MapComponent;