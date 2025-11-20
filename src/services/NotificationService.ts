import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Location, Sit } from '../types';
import { getDistanceInFeet, getBoundsFromLocation } from '../utils/geo';
import { FirebaseService } from './FirebaseService';
import { CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { GeofenceService, Geofence } from './GeofenceService';
import { LocationService } from './LocationService';

export class NotificationService {
  private static instance: NotificationService;
  private notifiedSits: Set<string> = new Set(); // Session cache

  // Development mode toggle
  // Set to false for production release
  private readonly IS_DEV = process.env.NODE_ENV === 'development';

  private readonly NOTIFICATION_RADIUS_FEET = 5280; // 1 mile

  // Constants derived from IS_DEV
  private readonly COOLDOWN_MS = this.IS_DEV ? 0 : 24 * 60 * 60 * 1000; // 24 hours in prod
  private readonly INSTALL_DELAY_MS = this.IS_DEV ? 0 : 24 * 60 * 60 * 1000; // 24 hours in prod
  private readonly FETCH_RADIUS_MILES = 3;
  private readonly CLOSE_SITS_COUNT = 19; // Number of closest sits to monitor
  private readonly CLOSE_SITS_RADIUS_FEET = 5280; // 1 mile radius for close sits

  private geofenceService: GeofenceService;
  private currentGeofences: Geofence[] = [];
  private isRefreshingGeofences = false;

  private constructor() {
    // Private constructor for singleton
    this.geofenceService = GeofenceService.getInstance();

    // Set up geofence event handlers
    this.geofenceService.onEnter((geofence) => {
      this.handleGeofenceEnter(geofence);
    });

    this.geofenceService.onExit((geofence) => {
      this.handleGeofenceExit(geofence);
    });
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async initialize() {
    // Only request permissions on native platforms, not web
    if (!Capacitor.isNativePlatform()) {
      console.log('[NotificationService] Not a native platform, skipping permission requests');
      return;
    }

    // 1. Request Notification Permissions (handled mostly by PushNotificationService, but good to double check)
    try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
            await LocalNotifications.requestPermissions();
        }

        // Create channel for Android
        await LocalNotifications.createChannel({
            id: 'proximity_channel',
            name: 'Proximity Alerts',
            description: 'Notifications when near a sit',
            importance: 3,
            visibility: 1
        }).catch(e => console.log('Error creating channel', e));

    } catch (e) {
        console.error('[NotificationService] Error initializing permissions', e);
    }

    // 2. Set up geofences when we have a location
    try {
      if (this.INSTALL_DELAY_MS > 0) {
        this.recordInstallTimestampIfNeeded();
      }
      // Wait for location, then set up geofences
      this.setupGeofencesOnLocation();
    } catch (e) {
        console.error('[NotificationService] Error initializing', e);
    }

    // 3. Setup notification action listener
    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
        const sitId = notification.notification.extra?.sitId;
        if (sitId) {
            // Construct deep link URL
            // const deepLink = `https://satlas.earth/?sitId=${sitId}`;

            // If app is open, we can just dispatch an event
            const event = new CustomEvent('openSit', { detail: { sitId } });
            window.dispatchEvent(event);

            // If we need to deep link (e.g. app was closed)
            // Capacitor usually handles this automatically if the notification
            // launch brings the app to foreground with the data.
        }
    });
  }

  /**
   * Set up geofences when we have a location
   */
  private async setupGeofencesOnLocation(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[NotificationService] Not native platform, skipping geofence setup');
      return;
    }

    try {
      // Get current location
      const location = await LocationService.getLastKnownLocation() ||
                       await this.getCurrentLocation();

      if (!location) {
        console.warn('[NotificationService] No location available, will retry when location is available');
        // Listen for location updates
        const locationService = new LocationService();
        const locationCallback = (loc?: Location) => {
          if (loc) {
            this.setupGeofencesForLocation(loc);
            locationService.offLocationUpdate(locationCallback);
          }
        };
        locationService.onLocationUpdate(locationCallback);
        return;
      }

      await this.setupGeofencesForLocation(location);
    } catch (e) {
      console.error('[NotificationService] Error setting up geofences:', e);
    }
  }

  /**
   * Get current location (helper method)
   */
  private async getCurrentLocation(): Promise<Location | null> {
    try {
      const locationService = new LocationService();
      return await locationService.getCurrentLocation();
    } catch (e) {
      console.error('[NotificationService] Error getting current location:', e);
      return null;
    }
  }

  /**
   * Set up geofences for a given location
   */
  private async setupGeofencesForLocation(location: Location): Promise<void> {
    if (this.isRefreshingGeofences) {
      console.log('[NotificationService] Already refreshing geofences, skipping');
      return;
    }

    this.isRefreshingGeofences = true;
    console.log('[NotificationService] Setting up geofences for location:', location);

    try {
      // Load sits within bounds
      const bounds = getBoundsFromLocation(location, this.FETCH_RADIUS_MILES);
      const sitsMap = await FirebaseService.loadSitsFromBounds(bounds);
      const allSits = Array.from(sitsMap.values());

      // Calculate distances and sort
      const sitsWithDistance = allSits
        .map(sit => ({
          sit,
          distance: getDistanceInFeet(location, sit.location)
        }))
        .sort((a, b) => a.distance - b.distance);

      // Select 19 closest sits within 1 mile (or all available if less than 19)
      const closeSits = sitsWithDistance
        .filter(item => item.distance <= this.CLOSE_SITS_RADIUS_FEET)
        .slice(0, this.CLOSE_SITS_COUNT);

      // If we have less than 19 sits within 1 mile, use all available sits
      const selectedCloseSits = closeSits.length > 0
        ? closeSits
        : sitsWithDistance.slice(0, Math.min(this.CLOSE_SITS_COUNT, sitsWithDistance.length));

      console.log(`[NotificationService] Selected ${selectedCloseSits.length} close sits`);

      // Create geofences for the close sits (1 mile radius each)
      const geofences: Geofence[] = selectedCloseSits.map((item, index) => ({
        id: `sit_${item.sit.id}`,
        sitId: item.sit.id,
        center: item.sit.location,
        radiusFeet: this.CLOSE_SITS_RADIUS_FEET,
        isOuterBoundary: false
      }));

      // Calculate outer boundary geofence
      // If we have 19+ sits, use the fetch radius. Otherwise, calculate radius to encompass all selected sits
      let outerBoundaryRadius: number;
      if (selectedCloseSits.length >= this.CLOSE_SITS_COUNT) {
        // Use the fetch radius (3 miles)
        outerBoundaryRadius = this.FETCH_RADIUS_MILES * 5280;
      } else {
        // Calculate radius to encompass all selected sits
        const maxDistance = selectedCloseSits.length > 0
          ? Math.max(...selectedCloseSits.map(item => item.distance))
          : this.FETCH_RADIUS_MILES * 5280;
        // Add some buffer (1 mile) to ensure we're outside when we exit
        outerBoundaryRadius = maxDistance + 5280;
      }

      // Add outer boundary geofence (centered at user location)
      geofences.push({
        id: 'outer_boundary',
        sitId: undefined,
        center: location,
        radiusFeet: outerBoundaryRadius,
        isOuterBoundary: true
      });

      this.currentGeofences = geofences;

      // Set up geofences
      await this.geofenceService.setupGeofences(geofences);
      console.log(`[NotificationService] Set up ${geofences.length} geofences (${geofences.length - 1} sits + 1 outer boundary)`);
    } catch (e) {
      console.error('[NotificationService] Error setting up geofences:', e);
    } finally {
      this.isRefreshingGeofences = false;
    }
  }

  /**
   * Handle geofence enter event
   */
  private handleGeofenceEnter(geofence: Geofence): void {
    if (geofence.isOuterBoundary) {
      // Shouldn't happen - we start inside the outer boundary
      console.log('[NotificationService] Entered outer boundary (unexpected)');
      return;
    }

    // Entered a sit geofence - send notification
    if (geofence.sitId) {
      console.log(`[NotificationService] Entered geofence for sit ${geofence.sitId}`);
      if (this.shouldNotify(geofence.sitId)) {
        this.sendNotification(geofence.sitId);
        this.markAsNotified(geofence.sitId);
      }
    }
  }

  /**
   * Handle geofence exit event
   */
  private handleGeofenceExit(geofence: Geofence): void {
    if (geofence.isOuterBoundary) {
      // Exited outer boundary - refresh geofences
      console.log('[NotificationService] Exited outer boundary, refreshing geofences');
      const lastKnownLocation = LocationService.getLastKnownLocation();
      if (lastKnownLocation) {
        this.setupGeofencesForLocation(lastKnownLocation);
      } else {
        this.setupGeofencesOnLocation();
      }
    }
    // We don't need to handle exit from sit geofences
  }

  private shouldNotify(sitId: string): boolean {
    // Check session cache first
    if (this.notifiedSits.has(sitId)) return false;

    // Check persistent storage
    // Skip alerts during the first 24 hours after install (if delay is enabled)
    if (this.INSTALL_DELAY_MS > 0) {
      const installTs = localStorage.getItem('satlas_install_timestamp');
      if (installTs && Date.now() - Number(installTs) < this.INSTALL_DELAY_MS) {
        console.log('[NotificationService] Skipping alert during first-day grace period.');
        return false;
      }
    }

    const timestamp = localStorage.getItem(`notified_sit_${sitId}`);
    if (timestamp) {
      const timeSince = Date.now() - parseInt(timestamp, 10);
      if (timeSince < this.COOLDOWN_MS) {
        this.notifiedSits.add(sitId); // Cache it for this session
        return false;
      }
    }
    return true;
  }

  private markAsNotified(sitId: string) {
    this.notifiedSits.add(sitId);
    localStorage.setItem(`notified_sit_${sitId}`, Date.now().toString());
  }

  private recordInstallTimestampIfNeeded() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!window.localStorage.getItem('satlas_install_timestamp')) {
      window.localStorage.setItem('satlas_install_timestamp', Date.now().toString());
    }
  }

  private async sendNotification(sitId: string) {
    // Try to fetch the first image for the sit
    let image = null;
    try {
      // Fetch the sit data
      const sit = await FirebaseService.getSit(sitId);
      if (sit && sit.imageCollectionId) {
        image = await FirebaseService.getFirstImageForSit(sit.imageCollectionId);
      }
    } catch (e) {
      console.error('Error fetching image for notification', e);
      return;
    }

    try {
      // Use the thumbnail version if available.
      // We manually construct the _thumb URL since we know the naming convention.
      let imageUrl = image?.photoURL;
      if (imageUrl) {
        // Check if it's already a thumbnail or has query params (skip if complex)
        if (!imageUrl.includes('_thumb') && !imageUrl.includes('?')) {
          const lastDotIndex = imageUrl.lastIndexOf('.');
          if (lastDotIndex !== -1) {
            imageUrl = imageUrl.substring(0, lastDotIndex) + '_thumb' + imageUrl.substring(lastDotIndex);
          }
        }
      }

      console.log('[NotificationService] Scheduling notification with image:', imageUrl);

      let localImagePath = undefined;
      if (imageUrl) {
        try {
            // We give it a unique name so we don't overwrite/read wrong files if multiple happen fast
            const filename = `sit_${sitId}_${Date.now()}_thumb.jpg`;
            localImagePath = await this.downloadImageToCache(imageUrl, filename);
            console.log('[NotificationService] Downloaded image to:', localImagePath);
        } catch (err) {
            console.error('[NotificationService] Failed to download image locally, falling back to remote URL', err);
        }
      }

      const iconToUse = localImagePath || imageUrl;

      await LocalNotifications.schedule({
        notifications: [{
            title: "You're near a Sit!",
            body: 'Tap to view in Satlas.',
            id: Math.floor(Math.random() * 100000),
            schedule: { at: new Date(Date.now() + 1000) },
            sound: 'beep.wav',
            extra: { sitId },
            channelId: 'proximity_channel',
            smallIcon: 'ic_stat_icon_config_sample',
            largeIcon: iconToUse,
            actionTypeId: 'OPEN_SIT',
            attachments: iconToUse ? [{ id: 'sit_image', url: iconToUse }] : undefined
        }]
      });
    } catch (e) {
        console.error('[NotificationService] Error scheduling notification', e);
    }
  }

  private async downloadImageToCache(url: string, filename: string): Promise<string> {
    try {
        console.log(`[NotificationService] Starting download of ${url} to ${filename}`);

        // Use CapacitorHttp to bypass CORS on WebViews (though less relevant for native file saving,
        // it ensures we get the data blob correctly)
        const response = await CapacitorHttp.get({
            url,
            responseType: 'blob'
        });

        // Convert blob to base64
        let base64Data: string = response.data;

        // If response.data is already a string (base64), use it.
        // If it's a Blob object (web), we need to convert.
        // CapacitorHttp on native usually returns base64 string for 'blob' responseType if it can't return actual Blob.
        // But let's be safe.
        if (typeof response.data !== 'string') {
             // This branch might only be hit in web context or specific plugin versions
             console.warn('[NotificationService] Received non-string data for image download');
             // In native, it usually returns a base64 string or path.
             // Let's assume it returns base64 string for now as per plugin docs for native.
        }

        // If it's a data URI, strip the prefix
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
        }

        const savedFile = await Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: Directory.Cache
        });

        return savedFile.uri;
    } catch (e) {
        console.error('Error downloading image', e);
        throw e;
    }
  }
}
