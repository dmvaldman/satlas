import { LocalNotifications } from '@capacitor/local-notifications';
import { registerPlugin } from '@capacitor/core';
import { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { Location, Sit } from '../types';
import { getDistanceInFeet, getBoundsFromLocation } from '../utils/geo';
import { FirebaseService } from './FirebaseService';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export class NotificationService {
  private static instance: NotificationService;
  private sits: Pick<Sit, 'id' | 'location' | 'imageCollectionId'>[] = [];
  private notifiedSits: Set<string> = new Set(); // Session cache

  // Development mode toggle
  // Set to false for production release
  private readonly IS_DEV = process.env.NODE_ENV === 'development';

  private readonly NOTIFICATION_RADIUS_FEET = 5280; // 1 mile

  // Constants derived from IS_DEV
  private readonly COOLDOWN_MS = this.IS_DEV ? 0 : 24 * 60 * 60 * 1000; // 24 hours in prod
  private readonly INSTALL_DELAY_MS = this.IS_DEV ? 0 : 24 * 60 * 60 * 1000; // 24 hours in prod
  private readonly ENABLE_INSTALL_DELAY = !this.IS_DEV;
  private readonly FETCH_RADIUS_MILES = 3;
  private readonly REFETCH_DISTANCE_MILES = this.IS_DEV ? 0.1 : 1; // Fetch more often in dev

  private watcherId: string | null = null;
  private lastFetchLocation: Location | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async initialize() {
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

    // 2. Load sits (initial load handled by watcher or explicit call if needed)
    try {
      if (this.ENABLE_INSTALL_DELAY) {
        this.recordInstallTimestampIfNeeded();
      }
      // We don't fetch all sits here anymore. We fetch on first location update.
      this.startBackgroundWatcher();
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

  async startBackgroundWatcher() {
    if (this.watcherId) return;

    try {
        console.log('[NotificationService] Starting background geolocation watcher...');

        this.watcherId = await BackgroundGeolocation.addWatcher(
            {
                backgroundMessage: "",
                backgroundTitle: "Satlas is running in the background.",
                requestPermissions: true,
                stale: false,
                distanceFilter: 100 // Only fire if moved 100 meters (saves battery)
            },
            (location, error) => {
                if (error) {
                    if (error.code === "NOT_AUTHORIZED") {
                        // User denied permission. We could show a custom modal here (like PermissionPromptModal)
                        // or just log it. For now, we suppress the system confirm dialog to avoid bad UX.
                        console.warn('[NotificationService] Background geolocation not authorized');
                    }
                    return console.error(error);
                }

                // Process the location update
                if (location) {
                    const userLocation = {
                        latitude: location.latitude,
                        longitude: location.longitude
                    };

                    this.updateSitsIfNeeded(userLocation).then(() => {
                        this.checkProximity(userLocation);
                    });
                }
            }
        );
        console.log('[NotificationService] Watcher started:', this.watcherId);
    } catch (e) {
        console.error('[NotificationService] Error starting background watcher', e);
    }
  }

  async stopBackgroundWatcher() {
      if (this.watcherId) {
          await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
          this.watcherId = null;
      }
  }

  private async updateSitsIfNeeded(currentLocation: Location) {
    // If we haven't fetched yet, or moved significantly, fetch new sits
    if (!this.lastFetchLocation || getDistanceInFeet(this.lastFetchLocation, currentLocation) > this.REFETCH_DISTANCE_MILES * 5280) {
      // console.log('[NotificationService] Fetching sits for new region...');

      const bounds = getBoundsFromLocation(currentLocation, this.FETCH_RADIUS_MILES);
      try {
        const sitsMap = await FirebaseService.loadSitsFromBounds(bounds);
        // Convert Map to array of lightweight objects for the service
        this.sits = Array.from(sitsMap.values()).map(sit => ({
            id: sit.id,
            location: sit.location,
            imageCollectionId: sit.imageCollectionId
        }));
        this.lastFetchLocation = currentLocation;
        console.log(`[NotificationService] Updated sits cache: ${this.sits.length} sits found within ${this.FETCH_RADIUS_MILES} miles.`);
      } catch (e) {
        console.error('[NotificationService] Error updating sits cache', e);
      }
    }
  }

  checkProximity(userLocation: Location) {
    if (this.sits.length === 0) return;

    // 1. Find all sits within range (regardless of whether they've been notified)
    const nearbySits = this.sits
      .map(sit => ({
        sit,
        distance: getDistanceInFeet(userLocation, sit.location)
      }))
      .filter(item => item.distance < this.NOTIFICATION_RADIUS_FEET)
      .sort((a, b) => a.distance - b.distance); // Sort by closest

    if (nearbySits.length === 0) return;

    // 2. Pick the absolute closest sit
    const closest = nearbySits[0];

    // 3. Check if we should notify for THIS specific sit
    if (this.shouldNotify(closest.sit.id)) {
      console.log(`[NotificationService] Sit ${closest.sit.id} is closest (${Math.round(closest.distance)}ft). Sending notification.`);
      this.sendNotification(closest.sit.id);
      this.markAsNotified(closest.sit.id);
    } else {
      // If the closest sit is already notified, we do NOTHING.
      // We do NOT fall back to the second closest.
    }
  }

  private shouldNotify(sitId: string): boolean {
    // Check session cache first
    if (this.notifiedSits.has(sitId)) return false;

    // Check persistent storage
    // Uncomment the following block before release to avoid alerts during the first 24 hours after install.
    if (this.ENABLE_INSTALL_DELAY) {
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
    let sit = this.sits.find(s => s.id === sitId);
    if (sit && 'imageCollectionId' in sit) {
        try {
            image = await FirebaseService.getFirstImageForSit((sit as any).imageCollectionId);
        } catch (e) {
            console.error('Error fetching image for notification', e);
            return;
        }
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
            largeIcon: imageUrl,
            actionTypeId: 'OPEN_SIT',
            attachments: imageUrl ? [{ id: 'sit_image', url: imageUrl }] : undefined
        }]
      });
    } catch (e) {
        console.error('[NotificationService] Error scheduling notification', e);
    }
  }
}
