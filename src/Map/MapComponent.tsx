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
}

class MapComponent extends React.Component<MapProps, MapState> {
  private debouncedHandleMapMove: (bounds: { north: number; south: number }) => void;
  private popupRoot: any = null;
  private popupContainer: HTMLElement | null = null;
  private currentPopupSitId: string | null = null;
  private currentPopupImages: Image[] = [];

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
  }

  private handleReplaceImage = (sitId: string, imageId: string) => {
    this.props.onOpenPhotoModal();
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
            user={this.props.user}
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