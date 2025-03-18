import mapboxgl from 'mapbox-gl';
import { Sit } from '../types';

export class ClusterManager {
  private clusterSourceAdded: boolean = false;
  private clusterColor: string = '#003f83';
  private clusterRadius: number = 22;

  public setupClusterLayer(map: mapboxgl.Map, sits: Map<string, Sit>): void {
    if (map.loaded()) {
      // Check if source already exists before initializing
      if (!this.sourceExists(map, 'sits')) {
        this.initializeClusterLayers(map, sits);
      } else {
        // Source already exists, just update it and mark as added
        this.clusterSourceAdded = true;
        this.updateClusterSource(map, sits);
      }
    } else {
      map.on('load', () => {
        // Check if source already exists before initializing
        if (!this.sourceExists(map, 'sits')) {
          this.initializeClusterLayers(map, sits);
        } else {
          // Source already exists, just update it and mark as added
          this.clusterSourceAdded = true;
          this.updateClusterSource(map, sits);
        }
      });
    }
  }

  public updateClusterSource(map: mapboxgl.Map, sits: Map<string, Sit>): void {
    if (!this.clusterSourceAdded) return;

    const source = map.getSource('sits') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(this.createGeoJSONFromSits(sits));
    }
  }

  public isClusterSourceAdded(): boolean {
    return this.clusterSourceAdded;
  }

  public areClusterLayersReady(map: mapboxgl.Map): boolean {
    try {
      return map.getLayer('clusters') !== undefined &&
             map.getLayer('cluster-count') !== undefined &&
             map.getLayer('unclustered-point') !== undefined;
    } catch (error) {
      return false;
    }
  }

  private initializeClusterLayers(map: mapboxgl.Map, sits: Map<string, Sit>): void {
    // Add a new source from our GeoJSON data
    map.addSource('sits', {
      type: 'geojson',
      data: this.createGeoJSONFromSits(sits),
      cluster: true,
      clusterMaxZoom: 13, // Max zoom to cluster points on
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
        'circle-radius': this.clusterRadius
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
        'text-size': 12
      },
      paint: {
        'text-color': '#ffffff'
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

    // Set state to indicate the cluster source is added
    this.clusterSourceAdded = true;

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
      map.easeTo({
        center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
        zoom: zoom
      });
    });
  };

  private createGeoJSONFromSits(sits: Map<string, Sit>) {
    const features = Array.from(sits.values()).map(sit => ({
      type: 'Feature' as const,
      properties: {
        id: sit.id,
        // Include any other properties you want to access in the cluster
        uploadedBy: sit.uploadedBy
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
    } catch (error) {
      return false;
    }
  }
}