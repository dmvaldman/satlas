import mapboxgl from 'mapbox-gl';
import { Sit } from './types';

export class MarkerManager {
  private markers: Map<string, mapboxgl.Marker> = new Map();
  private loadedSitIds: Set<string> = new Set();
  private map: mapboxgl.Map;

  constructor(map: mapboxgl.Map) {
    this.map = map;
  }

  createMarker(sit: Sit, isOwnSit: boolean, isFavorite: boolean, isNew: boolean = false): mapboxgl.Marker {
    const el = document.createElement('div');
    el.className = this.getMarkerClasses(isOwnSit, isFavorite, isNew);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.location.longitude, sit.location.latitude]);

    (marker as any).sit = sit;
    marker.addTo(this.map);
    return marker;
  }

  createTemporaryMarker(coordinates: { longitude: number; latitude: number }): { marker: mapboxgl.Marker, id: string } {
    const el = document.createElement('div');
    el.className = 'satlas-marker pending';

    const marker = new mapboxgl.Marker(el)
      .setLngLat([coordinates.longitude, coordinates.latitude])
      .addTo(this.map);

    const tempId = `temp_${Date.now()}`;
    this.markers.set(tempId, marker);

    return { marker, id: tempId };
  }

  getMarkerClassName(isOwnSit: boolean, isFavorite: boolean): string {
    return this.getMarkerClasses(isOwnSit, isFavorite);
  }

  updateMarkerStyle(marker: mapboxgl.Marker, isOwnSit: boolean, isFavorite: boolean) {
    const el = marker.getElement();
    const wasNew = el.classList.contains('new');  // Preserve new state
    el.className = this.getMarkerClasses(isOwnSit, isFavorite, wasNew);
  }

  private getMarkerClasses(isOwnSit: boolean, isFavorite: boolean, isNew: boolean = false): string {
    const classes = ['satlas-marker'];

    if (isFavorite) {
      classes.push('favorite');
    } else if (isOwnSit) {
      classes.push('own-sit');
    } else {
      classes.push('other-sit');
    }

    if (isNew) {
      classes.push('new');
    }

    return classes.join(' ');
  }

  has(sitId: string): boolean {
    return this.loadedSitIds.has(sitId);
  }

  get(sitId: string): mapboxgl.Marker | undefined {
    return this.markers.get(sitId);
  }

  set(sitId: string, marker: mapboxgl.Marker) {
    this.markers.set(sitId, marker);
    this.loadedSitIds.add(sitId);
  }

  delete(sitId: string) {
    const marker = this.markers.get(sitId);
    if (marker) {
      marker.remove();
      this.markers.delete(sitId);
      this.loadedSitIds.delete(sitId);
    }
  }

  getAll(): [string, mapboxgl.Marker][] {
    return Array.from(this.markers.entries());
  }

  clear() {
    this.markers.forEach(marker => marker.remove());
    this.markers.clear();
    this.loadedSitIds.clear();
  }
}