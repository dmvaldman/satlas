import { LocalNotifications } from '@capacitor/local-notifications';
import { registerPlugin } from '@capacitor/core';
import { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { Location, Sit } from '../types';
import { getDistanceInFeet } from '../utils/geo';
import { FirebaseService } from './FirebaseService';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export class NotificationService {
  private static instance: NotificationService;
  private sits: Pick<Sit, 'id' | 'location' | 'imageCollectionId'>[] = [];
  private notifiedSits: Set<string> = new Set(); // Session cache
  private readonly NOTIFICATION_RADIUS_FEET = 5280; // 1 mile
  private readonly COOLDOWN_MS = 1 * 60 * 1000; // 1 minute for testing
  private watcherId: string | null = null;

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

    // 2. Load sits
    try {
        this.sits = await FirebaseService.getAllSitLocations();
        console.log(`[NotificationService] Loaded ${this.sits.length} sit locations for monitoring`);

        // Start the background watcher once sits are loaded
        this.startBackgroundWatcher();
    } catch (e) {
        console.error('[NotificationService] Error loading sits', e);
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
                backgroundMessage: "Keeping an eye out for nearby Sits.",
                backgroundTitle: "Satlas is running",
                requestPermissions: true,
                stale: false,
                distanceFilter: 50 // Only fire if moved 50 meters (saves battery)
            },
            (location, error) => {
                if (error) {
                    if (error.code === "NOT_AUTHORIZED") {
                        if (window.confirm(
                            "To discover beautiful places to sit when you're near them (even if the app is closed), please choose 'Always Allow' in settings.\n\n" +
                            "Open settings now?"
                        )) {
                            BackgroundGeolocation.openSettings();
                        }
                    }
                    return console.error(error);
                }

                // Process the location update
                if (location) {
                    this.checkProximity({
                        latitude: location.latitude,
                        longitude: location.longitude
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

  checkProximity(userLocation: Location) {
    if (this.sits.length === 0) return;
    // console.log('[NotificationService] Checking proximity for', userLocation);

    for (const sit of this.sits) {
      if (this.shouldNotify(sit.id)) {
        const dist = getDistanceInFeet(userLocation, sit.location);
        if (dist < this.NOTIFICATION_RADIUS_FEET) {
          console.log(`[NotificationService] Sit ${sit.id} is nearby (${Math.round(dist)}ft). Sending notification.`);
          this.sendNotification(sit.id);
          this.markAsNotified(sit.id);
        }
      }
    }
  }

  private shouldNotify(sitId: string): boolean {
    // Check session cache first
    if (this.notifiedSits.has(sitId)) return false;

    // Check persistent storage
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

  private async sendNotification(sitId: string) {
    // Try to fetch the first image for the sit
    let image = null;
    let sit = this.sits.find(s => s.id === sitId);
    if (sit && 'imageCollectionId' in sit) {
        try {
            image = await FirebaseService.getFirstImageForSit((sit as any).imageCollectionId);
        } catch (e) {
            console.error('Error fetching image for notification', e);
        }
    }

    try {
        await LocalNotifications.schedule({
        notifications: [{
            title: 'Sit Nearby!',
            body: 'You are within 1 mile of a sit. Check it out!',
            id: Math.floor(Math.random() * 100000),
            schedule: { at: new Date(Date.now() + 1000) },
            sound: 'beep.wav',
            extra: { sitId },
            channelId: 'proximity_channel',
            smallIcon: 'ic_stat_icon_config_sample',
            actionTypeId: 'OPEN_SIT',
            attachments: image ? [{ id: 'sit_image', url: image.photoURL }] : undefined
        }]
        });
    } catch (e) {
        console.error('[NotificationService] Error scheduling notification', e);
    }
  }
}
