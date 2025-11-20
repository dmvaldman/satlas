import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Location } from '../types';
import { Geofencing, Geofence as PluginGeofence, GeofenceEvent } from '../plugins/geofencing/src';

export interface Geofence {
  id: string;
  sitId?: string; // If undefined, this is the outer boundary geofence
  center: Location;
  radiusFeet: number;
  isOuterBoundary: boolean; // true for the 20th geofence that triggers refresh
}

type GeofenceEnterCallback = (geofence: Geofence) => void;
type GeofenceExitCallback = (geofence: Geofence) => void;

export class GeofenceService {
  private static instance: GeofenceService;
  private geofences: Geofence[] = [];
  private lastKnownLocation: Location | null = null;
  private insideGeofences: Set<string> = new Set(); // Track which geofences we're currently inside
  private onEnterCallbacks: GeofenceEnterCallback[] = [];
  private onExitCallbacks: GeofenceExitCallback[] = [];
  private nativeListeners: Array<{ remove: () => void }> = [];

  private constructor() {}

  static getInstance(): GeofenceService {
    if (!GeofenceService.instance) {
      GeofenceService.instance = new GeofenceService();
    }
    return GeofenceService.instance;
  }

  /**
   * Set up geofences and start monitoring
   * Only works on native platforms - requires native geofencing plugin
   */
  async setupGeofences(geofences: Geofence[]): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[GeofenceService] Not a native platform, geofencing not supported');
      return;
    }

    // Clear existing geofences
    await this.stopMonitoring();

    this.geofences = geofences;
    console.log(`[GeofenceService] Setting up ${geofences.length} geofences`);

    // Request location permissions
    const permissionStatus = await Geolocation.requestPermissions();
    if (permissionStatus.location !== 'granted') {
      throw new Error('Location permission not granted');
    }

    // Use native geofencing (required for background/killed app support)
    await this.setupNativeGeofences(geofences);
  }

  /**
   * Set up native geofences (works when app is killed)
   */
  private async setupNativeGeofences(geofences: Geofence[]): Promise<void> {
    // Convert geofences to native format
    const nativeGeofences: PluginGeofence[] = geofences.map(g => ({
      id: g.id,
      latitude: g.center.latitude,
      longitude: g.center.longitude,
      radiusMeters: g.radiusFeet * 0.3048, // Convert feet to meters
      sitId: g.sitId,
      isOuterBoundary: g.isOuterBoundary
    }));

    // Add geofences to native plugin
    await Geofencing.addGeofences({ geofences: nativeGeofences });

    // Set up listeners for native events
    const enterListener = await Geofencing.addListener('geofenceEnter', (data: GeofenceEvent) => {
      const geofence = this.geofences.find(g => g.id === data.geofence.id);
      if (geofence) {
        this.handleGeofenceEnter(geofence);
      }
    });

    const exitListener = await Geofencing.addListener('geofenceExit', (data: GeofenceEvent) => {
      const geofence = this.geofences.find(g => g.id === data.geofence.id);
      if (geofence) {
        this.handleGeofenceExit(geofence);
      }
    });

    this.nativeListeners = [enterListener, exitListener];
    console.log('[GeofenceService] Native geofences set up successfully');
  }

  /**
   * Handle geofence enter event
   */
  private handleGeofenceEnter(geofence: Geofence): void {
    this.onEnterCallbacks.forEach(callback => {
      try {
        callback(geofence);
      } catch (error) {
        console.error('[GeofenceService] Error in enter callback:', error);
      }
    });
  }

  /**
   * Handle geofence exit event
   */
  private handleGeofenceExit(geofence: Geofence): void {
    this.onExitCallbacks.forEach(callback => {
      try {
        callback(geofence);
      } catch (error) {
        console.error('[GeofenceService] Error in exit callback:', error);
      }
    });
  }

  /**
   * Stop monitoring geofences
   */
  async stopMonitoring(): Promise<void> {
    // Remove native listeners
    for (const listener of this.nativeListeners) {
      listener.remove();
    }
    this.nativeListeners = [];

    // Remove native geofences
    try {
      await Geofencing.removeAllGeofences();
    } catch (error) {
      console.error('[GeofenceService] Error removing native geofences:', error);
    }

    this.geofences = [];
    this.insideGeofences.clear();
    this.lastKnownLocation = null;
    console.log('[GeofenceService] Stopped monitoring');
  }

  /**
   * Register callback for geofence enter events
   */
  onEnter(callback: GeofenceEnterCallback): void {
    this.onEnterCallbacks.push(callback);
  }

  /**
   * Register callback for geofence exit events
   */
  onExit(callback: GeofenceExitCallback): void {
    this.onExitCallbacks.push(callback);
  }

  /**
   * Remove callback
   */
  removeEnterCallback(callback: GeofenceEnterCallback): void {
    this.onEnterCallbacks = this.onEnterCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Remove callback
   */
  removeExitCallback(callback: GeofenceExitCallback): void {
    this.onExitCallbacks = this.onExitCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Get current geofences
   */
  getGeofences(): Geofence[] {
    return [...this.geofences];
  }

  /**
   * Check if native geofencing is available
   */
  isNativeGeofencingAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }
}
