export interface Geofence {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  sitId?: string;
  isOuterBoundary?: boolean;
}

export interface GeofenceEvent {
  geofence: Geofence;
  action: 'ENTER' | 'EXIT';
}

export interface GeofencingPlugin {
  /**
   * Add geofences to monitor
   */
  addGeofences(options: { geofences: Geofence[] }): Promise<{ success: boolean }>;

  /**
   * Remove specific geofences by IDs
   */
  removeGeofences(options: { ids: string[] }): Promise<{ success: boolean }>;

  /**
   * Remove all geofences
   */
  removeAllGeofences(): Promise<{ success: boolean }>;

  /**
   * Listen for geofence enter events
   */
  addListener(
    eventName: 'geofenceEnter',
    listenerFunc: (data: GeofenceEvent) => void
  ): Promise<{ remove: () => void }>;

  /**
   * Listen for geofence exit events
   */
  addListener(
    eventName: 'geofenceExit',
    listenerFunc: (data: GeofenceEvent) => void
  ): Promise<{ remove: () => void }>;
}

