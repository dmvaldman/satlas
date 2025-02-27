import mapboxgl from 'mapbox-gl';
import { Sit, MarkType, User } from '../types';

export class MarkerManager {
  private markers: Map<string, mapboxgl.Marker> = new Map();
  private clusterMarkers: Set<mapboxgl.Marker> = new Set();

  constructor(
    private onMarkerClick: (sit: Sit) => void
  ) {}

  public showMarkers(
    map: mapboxgl.Map,
    sits: Map<string, Sit>,
    marks: Map<string, Set<MarkType>>,
    user: User | null
  ): void {
    Array.from(sits.values()).forEach(sit => {
      const sitMarks = marks.get(sit.id) || new Set();

      if (!this.markers.has(sit.id)) {
        // Create new marker
        const el = document.createElement('div');
        el.className = this.getMarkerClasses(sit, user, sitMarks).join(' ');
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onMarkerClick(sit);
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

  public updateMarker(
    sitId: string,
    sit: Sit,
    marks: Set<MarkType>,
    user: User | null
  ): void {
    if (this.markers.has(sitId)) {
      const marker = this.markers.get(sitId)!;
      const el = marker.getElement();
      el.className = 'mapboxgl-marker';
      this.getMarkerClasses(sit, user, marks).forEach(className => {
        el.classList.add(className);
      });
    }
  }

  public removeAllMarkers(): void {
    this.markers.forEach(marker => marker.remove());
    this.markers.clear();
    this.clusterMarkers.forEach(marker => marker.remove());
    this.clusterMarkers.clear();
  }

  public hasMarker(sitId: string): boolean {
    return this.markers.has(sitId);
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
}