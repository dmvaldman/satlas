import React from 'react';
import mapboxgl from 'mapbox-gl';
import { Sit, MarkType, User } from '../types';

interface MarkerProps {
  sit: Sit;
  map: mapboxgl.Map;
  user: User | null;
  marks: Set<MarkType>;
  onMarkerClick: (sit: Sit) => void;
  onMarkUpdate: (sitId: string, type: MarkType, isActive: boolean) => Promise<void>;
}

interface MarkerState {
  marker: mapboxgl.Marker | null;
}

class MarkerComponent extends React.Component<MarkerProps, MarkerState> {
  constructor(props: MarkerProps) {
    super(props);
    this.state = {
      marker: null
    };
  }

  componentDidMount() {
    this.createMarker();
  }

  componentDidUpdate(prevProps: MarkerProps) {
    // Update marker styling if marks or userId changes
    if (prevProps.marks !== this.props.marks || prevProps.user !== this.props.user) {
      this.updateMarkerStyle();
    }

    // Update marker position if sit location changes
    if (
      prevProps.sit.location.latitude !== this.props.sit.location.latitude ||
      prevProps.sit.location.longitude !== this.props.sit.location.longitude
    ) {
      this.updateMarkerPosition();
    }
  }

  componentWillUnmount() {
    if (this.state.marker) {
      this.state.marker.remove();
    }
  }

  private getMarkerClasses(): string[] {
    const { sit, user, marks } = this.props;
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

    if (!sit.imageCollectionId) {
      classes.push('new');
    }

    return classes;
  }

  private createMarker() {
    const { sit, map } = this.props;

    const el = document.createElement('div');
    el.className = this.getMarkerClasses().join(' ');

    el.addEventListener('click', this.handleMarkerClick);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.location.longitude, sit.location.latitude])
      .addTo(map);

    this.setState({ marker });
  }

  private updateMarkerStyle() {
    const { marker } = this.state;
    if (!marker) return;

    const el = marker.getElement();
    // Remove existing classes
    el.classList.remove('satlas-marker', 'own-sit', 'favorite', 'visited', 'want-to-go', 'new');
    // Add updated classes
    this.getMarkerClasses().forEach(className => {
      el.classList.add(className);
    });
  }

  private updateMarkerPosition() {
    const { marker } = this.state;
    const { sit } = this.props;

    if (marker) {
      marker.setLngLat([sit.location.longitude, sit.location.latitude]);
    }
  }

  private handleMarkerClick = (e: MouseEvent) => {
    e.stopPropagation();
    this.props.onMarkerClick(this.props.sit);
  };

  render() {
    return null; // Marker is handled by mapbox-gl directly
  }
}

export default MarkerComponent;