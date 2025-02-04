import mapboxgl from 'mapbox-gl';
import { Sit } from './types';

export class MarkerManager {
  private markers: Map<string, mapboxgl.Marker> = new Map();
  private loadedSitIds: Set<string> = new Set();

  constructor(private map: mapboxgl.Map) {}

  createMarker(sit: Sit, isOwnSit: boolean, isFavorite: boolean): mapboxgl.Marker {
    const el = document.createElement('div');
    el.className = this.getMarkerClassName(isOwnSit, isFavorite);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([sit.location.longitude, sit.location.latitude])
      .addTo(this.map);

    // Store sit data with marker
    (marker as any).sit = sit;

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

  updateMarkerStyle(marker: mapboxgl.Marker, isOwnSit: boolean, isFavorite: boolean) {
    const el = marker.getElement();
    // Preserve Mapbox classes while updating our custom classes
    const mapboxClasses = Array.from(el.classList)
      .filter(cls => cls.startsWith('mapboxgl-'))
      .join(' ');

    el.className = `satlas-marker ${mapboxClasses}${isOwnSit ? ' own-sit' : ''}${isFavorite ? ' favorite' : ''}`;
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