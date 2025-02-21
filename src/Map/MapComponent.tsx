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
  userId: string | null;
  user: User | null;
  onSitClick: (sit: Sit) => void;
  onLoadNearbySits: (bounds: { north: number; south: number }) => Promise<void>;
  onToggleMark: (sitId: string, type: MarkType) => Promise<void>;
  onDeleteImage: (sitId: string, imageId: string) => Promise<void>;
  onReplaceImage: (sitId: string, imageId: string) => void;
  getImagesForSit: (imageCollectionId: string) => Promise<Image[]>;
  onModalOpen?: (type: 'photo' | 'profile', data?: any) => void;
}

interface MapState {
  activePopup: mapboxgl.Popup | null;
}

class MapComponent extends React.Component<MapProps, MapState> {
  private debouncedHandleMapMove: (bounds: { north: number; south: number }) => void;

  constructor(props: MapProps) {
    super(props);
    this.state = {
      activePopup: null
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
    }
  }

  componentWillUnmount() {
    const { map } = this.props;
    if (map) {
      map.off('moveend', this.handleMapMove);
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
      debugger;
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
          onReplaceImage={this.handleReplaceImage}
        />
      );

      popup
        .setDOMContent(container)
        .setLngLat([sit.location.longitude, sit.location.latitude])
        .addTo(map);

      this.setState({ activePopup: popup });
    } catch (error) {
      console.error('Error loading popup content:', error);
      root.render(
        <div className="satlas-popup-error">
          Failed to load content
        </div>
      );
      popup
        .setDOMContent(container)
        .setLngLat([sit.location.longitude, sit.location.latitude])
        .addTo(map);
    }
  };

  private handleReplaceImage = (sitId: string, imageId: string) => {
    if (this.props.onModalOpen) {
      this.props.onModalOpen('photo', { sitId, imageId });
    }
  };

  render() {
    const { map, sits, isLoading } = this.props;

    if (isLoading) {
      return (
        <div className="loading">
          <p>Loading map...</p>
        </div>
      );
    }

    return (
      <>
        {map && Array.from(sits.values()).map(sit => (
          <MarkerComponent
            key={sit.id}
            sit={sit}
            map={map}
            userId={this.props.userId}
            marks={this.props.marks.get(sit.id) || new Set()}
            onMarkerClick={this.handleMarkerClick}
            onMarkUpdate={this.props.onToggleMark}
          />
        ))}
      </>
    );
  }
}

export default MapComponent;