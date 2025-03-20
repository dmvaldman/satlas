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
    user: User | null,
    seenSits: Set<string> = new Set()
  ): void {
    Array.from(sits.values()).forEach(sit => {
      const sitMarks = marks.get(sit.id) || new Set();

      if (!this.markers.has(sit.id)) {
        // Create new marker
        const el = document.createElement('div');
        el.className = this.getMarkerClasses(sit, user, sitMarks, seenSits).join(' ');
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
        this.getMarkerClasses(sit, user, sitMarks, seenSits).forEach(className => {
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
    user: User | null,
    seenSits: Set<string> = new Set()
  ): void {
    if (this.markers.has(sitId)) {
      const marker = this.markers.get(sitId)!;
      const el = marker.getElement();
      el.className = 'mapboxgl-marker';
      this.getMarkerClasses(sit, user, marks, seenSits).forEach(className => {
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

  private getMarkerClasses(
    sit: Sit,
    user: User | null,
    marks: Set<MarkType>,
    seenSits: Set<string> = new Set()
  ): string[] {
    const classes = ['satlas-marker'];

    // Check if this is the user's own sit
    const isOwnSit = user && sit.uploadedBy && sit.uploadedBy === user.uid;
    if (isOwnSit) {
      classes.push('own-sit');
    }

    // Add classes for marked sits
    const hasMarks = marks.size > 0;
    if (marks.has('favorite')) {
      classes.push('favorite');
    }

    if (marks.has('visited')) {
      classes.push('visited');
    }

    if (marks.has('wantToGo')) {
      classes.push('want-to-go');
    }

    // Add seen class only if the sit isn't already marked
    // and isn't the user's own sit
    if (seenSits.has(sit.id) && !isOwnSit && !hasMarks) {
      classes.push('seen');
    }

    return classes;
  }
}