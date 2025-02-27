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
      clusterSourceAdded: false
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
    const { map, marks, favoriteCount, user } = this.props;
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
          onToggleMark={this.props.onToggleMark}
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
    if (
      this.popupRoot &&
      this.currentPopupSitId &&
      (prevProps.marks !== this.props.marks ||
       prevProps.favoriteCount !== this.props.favoriteCount)
    ) {
      const sitId = this.currentPopupSitId;
      const sit = this.props.sits.get(sitId);
      if (sit) {
        this.popupRoot.render(
          <PopupComponent
            sit={sit}
            images={this.currentPopupImages}
            user={this.props.user}
            marks={this.props.marks.get(sitId) || new Set()}
            favoriteCount={this.props.favoriteCount.get(sitId) || 0}
            onToggleMark={this.props.onToggleMark}
            onDeleteImage={this.props.onDeleteImage}
            onReplaceImage={this.handleReplaceImage}
            onOpenPhotoModal={this.props.onOpenPhotoModal}
            onOpenProfileModal={this.props.onOpenProfileModal}
            currentLocation={this.props.currentLocation}
          />
        );
      }
    }

    const { map, sits } = this.props;

    // If map is available and sits have changed, update the GeoJSON source
    if (map && prevProps.sits !== sits && this.state.clusterSourceAdded) {
      this.updateClusterSource(map, sits);
    }
  }

  private handleReplaceImage = (sitId: string, imageId: string) => {
    this.props.onOpenPhotoModal();
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
      clusterMaxZoom: 14, // Max zoom to cluster points on
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
    const clusterMaxZoom = 14; // Should match the value in setupClusterLayer

    // If zoomed in beyond clustering threshold, show individual markers
    if (zoom >= clusterMaxZoom) {
      // Hide cluster layers
      map.setLayoutProperty('clusters', 'visibility', 'none');
      map.setLayoutProperty('cluster-count', 'visibility', 'none');

      // Show individual markers
      Array.from(sits.values()).forEach(sit => {
        // Check if marker already exists
        if (!this.markers.has(sit.id)) {
          // Create new marker
          const el = document.createElement('div');
          el.className = this.getMarkerClasses(sit, user, marks.get(sit.id) || new Set()).join(' ');
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
          this.getMarkerClasses(sit, user, marks.get(sit.id) || new Set()).forEach(className => {
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
    } else {
      // Show cluster layers
      map.setLayoutProperty('clusters', 'visibility', 'visible');
      map.setLayoutProperty('cluster-count', 'visibility', 'visible');

      // Hide individual markers
      this.markers.forEach(marker => {
        marker.remove();
      });
      // Note: We don't clear the markers Map here, just remove them from the map
      // This way we can reuse them when zooming back in
    }
  };

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