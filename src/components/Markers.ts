import mapboxgl from 'mapbox-gl';
import { Sit, MarkType, User } from '../types';

export class Markers {
  private markers: Map<string, mapboxgl.Marker> = new Map();
  private clusterMarkers: Set<mapboxgl.Marker> = new Set();

  constructor(
    private onMarkerClick: (sit: Sit) => void
  ) {}


  private createIconElement(marks: Set<MarkType>): SVGElement {
    let iconPath = '';  // Default empty string

    if (marks.has('favorite')) {
      iconPath = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    } else if (marks.has('visited')) {
      iconPath = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z';
    } else if (marks.has('wantToGo')) {
      iconPath = 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z';
    }

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'marker-icon');
    icon.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', iconPath);

    if (!marks.has('favorite')) {
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke', '#000000');
    }

    icon.appendChild(path);
    return icon;
  }

  private createMarker(sit: Sit, marks: Set<MarkType>, user: User | null, seenSits: Set<string>): mapboxgl.Marker {
    // Create container for larger hit area
    const container = document.createElement('div');
    container.className = 'mapboxgl-marker marker-container';

    // Create the actual marker element
    const el = document.createElement('div');
    el.className = this.getMarkerClasses(sit, user, marks, seenSits).join(' ');

    // Add icon based on marks
    if (marks.size > 0) {
      el.appendChild(this.createIconElement(marks));
    }

    // Add click handler to container
    container.addEventListener('click', (e) => {
      e.stopPropagation();

      // --- Add Click Effect ---
      const markerElement = container.querySelector('.marker');
      if (markerElement) {
          markerElement.classList.add('clicked');
          setTimeout(() => {
              markerElement.classList.remove('clicked');
          }, 150); // Duration matches CSS transition
      }
      // --- End Click Effect ---

      // Call the original handler
      this.onMarkerClick(sit);
    });

    container.appendChild(el);

    return new mapboxgl.Marker({
      element: container,
      anchor: 'center'
    }).setLngLat([sit.location.longitude, sit.location.latitude]);
  }

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
        const marker = this.createMarker(sit, sitMarks, user, seenSits);
        marker.addTo(map);
        this.markers.set(sit.id, marker);
      } else {
        // Update existing marker
        const marker = this.markers.get(sit.id)!;
        const container = marker.getElement();
        container.className = 'mapboxgl-marker marker-container';

        const el = container.firstElementChild as HTMLElement;
        el.className = this.getMarkerClasses(sit, user, sitMarks, seenSits).join(' ');

        // Clear existing icon
        const existingIcon = el.querySelector('.marker-icon');
        if (existingIcon) {
          existingIcon.remove();
        }

        // Add new icon if needed
        if (sitMarks.size > 0) {
          el.appendChild(this.createIconElement(sitMarks));
        }

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
    const classes = ['marker'];

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

    // Add seen class only if the sit isn't the user's own sit
    if (seenSits.has(sit.id) && !isOwnSit) {
      classes.push('seen');
    }

    return classes;
  }
}