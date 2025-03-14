import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed as PushActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications, LocalNotificationSchema, ActionPerformed as LocalActionPerformed } from '@capacitor/local-notifications';
import { FirebaseService } from './FirebaseService';
import { UserPreferences } from '../types';

// Notification types
export enum NotificationType {
  PROXIMITY_ALERT = 'proximity_alert',
  NEW_SIT_ALERT = 'new_sit_alert'
}

// Notification listener type
export type NotificationListener = (notification: LocalNotificationSchema | PushNotificationSchema) => void;

export class PushNotificationService {
  private static instance: PushNotificationService;
  private initialized = false;
  private listeners: NotificationListener[] = [];
  private userPreferences: UserPreferences | null = null;
  private userId: string | null = null;
  private backgroundGeolocationEnabled = false;

  /**
   * Get the singleton instance
   */
  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Initialize the notification service
   */
  public async initialize(userId: string, preferences: UserPreferences): Promise<void> {
    if (this.initialized && this.userId === userId) return;

    this.userId = userId;
    this.userPreferences = preferences;

    if (Capacitor.isNativePlatform()) {
      // Register for push notifications if enabled
      if (preferences.pushNotificationsEnabled) {
        await this.registerPushNotifications();
      }

      // Initialize local notifications for in-app handling
      await this.initializeLocalNotifications();

      // Initialize background geolocation if push notifications are enabled
      if (preferences.pushNotificationsEnabled) {
        await this.initializeBackgroundGeolocation();
      }
    }

    this.initialized = true;
  }

  /**
   * Update user preferences
   */
  public async updatePreferences(preferences: UserPreferences): Promise<void> {
    const previousEnabled = this.userPreferences?.pushNotificationsEnabled || false;
    this.userPreferences = preferences;

    // Handle push notification preference changes
    if (Capacitor.isNativePlatform()) {
      if (preferences.pushNotificationsEnabled && !previousEnabled) {
        // Newly enabled - register for push notifications
        await this.registerPushNotifications();
        // Start background geolocation
        await this.initializeBackgroundGeolocation();
      } else if (!preferences.pushNotificationsEnabled && previousEnabled) {
        // Newly disabled - unregister push notifications
        await this.unregisterPushNotifications();
        // Stop background geolocation
        await this.stopBackgroundGeolocation();
      }
    }
  }

  /**
   * Add a notification listener
   */
  public addNotificationListener(listener: NotificationListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a notification listener
   */
  public removeNotificationListener(listener: NotificationListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Register for push notifications
   */
  private async registerPushNotifications(): Promise<void> {
    try {
      // Request permission
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') {
        console.warn('Push notification permission not granted');
        return;
      }

      // Register with FCM
      await PushNotifications.register();

      // Listen for registration token
      PushNotifications.addListener('registration', (token: Token) => {
        console.log('Push registration success:', token.value);
        this.savePushToken(token.value);
      });

      // Listen for push notification received
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('Push notification received:', notification);
        this.notifyListeners(notification);
      });

      // Listen for push notification action performed
      PushNotifications.addListener('pushNotificationActionPerformed', (action: PushActionPerformed) => {
        console.log('Push notification action performed:', action);
        // Also notify listeners of the action
        if (action.notification) {
          this.notifyListeners(action.notification);
        }
      });
    } catch (error) {
      console.error('Error registering push notifications:', error);
    }
  }

  /**
   * Unregister from push notifications
   */
  private async unregisterPushNotifications(): Promise<void> {
    if (!this.userId) return;

    try {
      // Get existing tokens
      const tokens = await FirebaseService.getUserPushTokens(this.userId);

      // Delete all tokens for this user
      for (const token of tokens) {
        await FirebaseService.deletePushToken(token.id);
      }

      // Remove all listeners
      PushNotifications.removeAllListeners();
    } catch (error) {
      console.error('Error unregistering push notifications:', error);
    }
  }

  /**
   * Initialize local notifications
   */
  private async initializeLocalNotifications(): Promise<void> {
    try {
      // Request permission
      const permission = await LocalNotifications.requestPermissions();
      if (!permission.display) {
        console.warn('Local notification permission not granted');
        return;
      }

      // Listen for local notification received
      LocalNotifications.addListener('localNotificationReceived', (notification: LocalNotificationSchema) => {
        console.log('Local notification received:', notification);
        this.notifyListeners(notification);
      });

      // Listen for local notification action performed
      LocalNotifications.addListener('localNotificationActionPerformed', (action: LocalActionPerformed) => {
        console.log('Local notification action performed:', action);
        if (action.notification) {
          this.notifyListeners(action.notification);
        }
      });
    } catch (error) {
      console.error('Error initializing local notifications:', error);
    }
  }

  /**
   * Save the push notification token to Firebase
   */
  private async savePushToken(token: string): Promise<void> {
    if (!this.userId) return;

    try {
      // Determine platform
      const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

      // Save the token to Firebase
      await FirebaseService.saveUserPushToken(this.userId, token, platform);
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  }

  /**
   * Notify all listeners of a notification
   */
  private notifyListeners(notification: LocalNotificationSchema | PushNotificationSchema): void {
    this.listeners.forEach((listener) => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }
}