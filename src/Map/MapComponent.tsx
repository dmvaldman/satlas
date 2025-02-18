import React from 'react';
import mapboxgl from 'mapbox-gl';
import { Sit, MarkType, User, Image } from '../types';
import { createRoot } from 'react-dom/client';
import PopupComponent from './Popup';

mapboxgl.accessToken = 'pk.eyJ1IjoiZG12YWxkbWFuIiwiYSI6ImNpbXRmNXpjaTAxem92OWtrcHkxcTduaHEifQ.6sfBuE2sOf5bVUU6cQJLVQ';

interface MapProps {
  map: mapboxgl.Map | null;
  sits: Map<string, Sit>;
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;
  currentLocation: { latitude: number; longitude: number } | null;
  isLoading: boolean;
  userId: string | null;
  user: User | null;
  onSitClick: (sit: Sit) => void;
  onLoadNearbySits: (bounds: { north: number; south: number }) => Promise<void>;
  onToggleMark: (sitId: string, type: MarkType) => Promise<void>;
  onDeleteImage: (sitId: string, imageId: string) => Promise<void>;
  onReplaceImage: (sitId: string, imageId: string) => void;
  getImagesForSit: (imageCollectionId: string) => Promise<Image[]>;
}

interface MapState {
  mapboxMarkers: Map<string, mapboxgl.Marker>;
  activePopup: mapboxgl.Popup | null;
}

class MapComponent extends React.Component<MapProps, MapState> {
  constructor(props: MapProps) {
    super(props);
    this.state = {
      mapboxMarkers: new Map(),
      activePopup: null
    };
  }

  componentDidMount() {
    const { map } = this.props;
    if (map) {
      this.setupMapListeners(map);
      this.loadMarkers();
    }
  }

  componentDidUpdate(prevProps: MapProps) {
    // Update markers when sits change
    if (prevProps.sits !== this.props.sits) {
      this.loadMarkers();
    }

    // Update marker styles when marks change
    if (prevProps.marks !== this.props.marks) {
      this.updateAllMarkerStyles();
    }
  }

  componentWillUnmount() {
    const { map } = this.props;
    if (map) {
      map.off('moveend', this.handleMapMove);
    }
    this.clearMarkers();
  }

  private setupMapListeners(map: mapboxgl.Map) {
    map.on('moveend', this.handleMapMove);
  }

  private handleMapMove = async () => {
    const { map, onLoadNearbySits } = this.props;
    if (!map) return;

    const bounds = map.getBounds();
    await onLoadNearbySits({
      north: bounds.getNorth(),
      south: bounds.getSouth()
    });
  };

  private loadMarkers() {
    this.clearMarkers();
    const { sits } = this.props;
    sits.forEach(sit => this.createMarker(sit));
  }

  private clearMarkers() {
    const { mapboxMarkers } = this.state;
    mapboxMarkers.forEach(marker => marker.remove());
    this.setState({ mapboxMarkers: new Map() });
  }

  private createMarker(sit: Sit) {
    const { map, userId } = this.props;
    if (!map) return;

    const el = document.createElement('div');
    el.className = 'satlas-marker';
    this.updateMarkerClasses(el, sit);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.longitude, sit.latitude])
      .addTo(map);

    marker.getElement().addEventListener('click', () => {
      this.handleMarkerClick(sit);
    });

    this.setState(prevState => ({
      mapboxMarkers: new Map(prevState.mapboxMarkers).set(sit.id, marker)
    }));
  }

  private updateMarkerClasses(el: HTMLElement, sit: Sit) {
    const { marks, userId } = this.props;
    const classes = ['satlas-marker'];

    if (sit.uploadedBy === userId) {
      classes.push('own-sit');
    }

    const sitMarks = marks.get(sit.id);
    if (sitMarks?.has('favorite')) {
      classes.push('favorite');
    }

    el.className = classes.join(' ');
  }

  private updateAllMarkerStyles() {
    const { sits } = this.props;
    const { mapboxMarkers } = this.state;

    sits.forEach(sit => {
      const marker = mapboxMarkers.get(sit.id);
      if (marker) {
        this.updateMarkerClasses(marker.getElement(), sit);
      }
    });
  }

  private async handleMarkerClick(sit: Sit) {
    const { map, currentLocation, marks, favoriteCount, user } = this.props;
    if (!map || !currentLocation) return;

    const { activePopup } = this.state;
    if (activePopup) {
      activePopup.remove();
    }

    const popup = new mapboxgl.Popup({
      closeButton: false,
      maxWidth: '300px',
      offset: 25,
      anchor: 'bottom',
      className: 'satlas-popup-container'
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    try {
      const images = await this.props.getImagesForSit(sit.imageCollectionId);

      root.render(
        <PopupComponent
          sit={sit}
          images={images}
          currentLocation={currentLocation}
          user={user}
          marks={marks.get(sit.id) || new Set()}
          favoriteCount={favoriteCount.get(sit.id) || 0}
          onToggleMark={this.props.onToggleMark}
          onDeleteImage={this.props.onDeleteImage}
          onReplaceImage={this.props.onReplaceImage}
        />
      );

      popup
        .setDOMContent(container)
        .setLngLat([sit.longitude, sit.latitude])
        .addTo(map);

      this.setState({ activePopup: popup });
    } catch (error) {
      console.error('Error loading popup content:', error);
      // Render error state in popup
      root.render(
        <div className="satlas-popup-error">
          Failed to load content
        </div>
      );
      popup
        .setDOMContent(container)
        .setLngLat([sit.longitude, sit.latitude])
        .addTo(map);
    }
  }

  render() {
    const { isLoading } = this.props;

    return (
      <div id="map-container">
        {isLoading && (
          <div className="map-loading">
            <p>Loading map...</p>
          </div>
        )}
      </div>
    );
  }
}

export default MapComponent;