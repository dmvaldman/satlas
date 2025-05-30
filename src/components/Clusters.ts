import mapboxgl from 'mapbox-gl';
import { Sit } from '../types';

export class Clusters {
  private clusterColor!: string;
  private clusterRadius: number = 24;

  public setupClusterLayer(map: mapboxgl.Map, sits: Map<string, Sit>): void {
    if (map.loaded()) {
      this.onMapLoaded(map, sits);
    } else {
      map.on('load', () => {
        this.onMapLoaded(map, sits);
      });
    }
  }

  private onMapLoaded(map: mapboxgl.Map, sits: Map<string, Sit>): void {
    this.clusterColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--cluster-color')
      .trim();

    // Check if source already exists before initializing
    if (!this.sourceExists(map, 'sits')) {
      this.initializeClusterLayers(map, sits);
    } else {
      // Source already exists, just update it and mark as added
      this.updateClusterSource(map, sits);
    }
  }

  public updateClusterSource(map: mapboxgl.Map, sits: Map<string, Sit>): void {
    const source = map.getSource('sits') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(this.createGeoJSONFromSits(sits));
    }
  }

  public areClusterLayersReady(map: mapboxgl.Map): boolean {
    try {
      return map.getLayer('clusters') !== undefined &&
             map.getLayer('cluster-count') !== undefined &&
             map.getLayer('unclustered-point') !== undefined;
    } catch {
      return false;
    }
  }

  private initializeClusterLayers(map: mapboxgl.Map, sits: Map<string, Sit>): void {
    // Add a new source from our GeoJSON data
    map.addSource('sits', {
      type: 'geojson',
      data: this.createGeoJSONFromSits(sits),
      cluster: true,
      clusterMaxZoom: 12, // Max zoom to cluster points on
      clusterMinPoints: 2, // Minimum points to form a cluster
      clusterRadius: 50 // Radius of each cluster when clustering points
    });

    // Add a layer for the clusters
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'sits',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': this.clusterColor,
        'circle-radius': this.clusterRadius,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#000000',
      }
    });

    // Add a layer for the cluster count labels
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'sits',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 18,
      },
      paint: {
        'text-color': '#fff',
        'text-halo-color': '#000',
        'text-halo-width': 0.5
      }
    });

    // Add a layer for unclustered points (we'll hide this and use our custom markers)
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'sits',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': 'rgba(0, 0, 0, 0)', // Transparent
        'circle-radius': 0, // Size 0 to hide
        'circle-stroke-width': 0
      }
    });

    // Add click handler for clusters
    map.on('click', 'clusters', this.handleClusterClick);

    // Change cursor when hovering over clusters
    map.on('mouseenter', 'clusters', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'clusters', () => {
      map.getCanvas().style.cursor = '';
    });
  }

  private handleClusterClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
    const map = e.target;
    if (!map || !e.features) return;

    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (!features.length) return;

    const clusterId = features[0].properties?.cluster_id;
    if (clusterId === undefined) return;

    // Get the cluster source
    const source = map.getSource('sits') as mapboxgl.GeoJSONSource;

    // Get the cluster expansion zoom
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err || zoom === null || zoom === undefined) return;

      // Center the map on the cluster and zoom in
      // Small hack to make the clusters not disappear
      map.flyTo({
        center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
        zoom: zoom + 1,
        duration: 300,
        essential: true
      });
    });
  };

  private createGeoJSONFromSits(sits: Map<string, Sit>) {
    const features = Array.from(sits.values()).map(sit => ({
      type: 'Feature' as const,
      properties: {
        id: sit.id,
        // Include any other properties you want to access in the cluster
        uploadedBy: sit.uploadedBy,
        uploadedByUsername: sit.uploadedByUsername
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [sit.location.longitude, sit.location.latitude]
      }
    }));

    return {
      type: 'FeatureCollection' as const,
      features
    };
  }

  // Add a helper method to check if a source exists
  private sourceExists(map: mapboxgl.Map, sourceId: string): boolean {
    try {
      return !!map.getSource(sourceId);
    } catch {
      return false;
    }
  }
}