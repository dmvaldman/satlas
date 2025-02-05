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
    el.className = 'satlas-marker';
    if (isOwnSit) el.classList.add('own-sit');
    if (isFavorite) el.classList.add('favorite');
    if (isNew) el.classList.add('new');

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
    return `satlas-marker${isOwnSit ? ' own-sit' : ''}${isFavorite ? ' favorite' : ''}`;
  }

  updateMarkerStyle(marker: mapboxgl.Marker, isOwnSit: boolean, isFavorite: boolean, isNew: boolean = false) {
    const el = marker.getElement();
    el.className = 'satlas-marker';
    if (isOwnSit) el.classList.add('own-sit');
    if (isFavorite) el.classList.add('favorite');
    if (isNew) el.classList.add('new');
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