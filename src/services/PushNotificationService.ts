import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed as PushActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications, LocalNotificationSchema, ActionPerformed as LocalActionPerformed } from '@capacitor/local-notifications';
import { FirebaseService } from './FirebaseService';
import { UserPreferences } from '../types';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';

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
  private userId: string | null = null;
  private enabled = false;

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
    console.log('[PushNotificationService] Initializing with userId:', userId);

    // Always update userId and enabled state
    this.userId = userId;
    this.enabled = preferences.pushNotificationsEnabled;

    // If already initialized with same user, just update the enabled state
    if (this.initialized && this.userId === userId) {
      console.log('[PushNotificationService] Already initialized for this user, updating enabled state');
      return;
    }

    if (Capacitor.isNativePlatform()) {
      console.log('[PushNotificationService] Initializing on native platform');

      // Register for push notifications if enabled
      if (this.enabled) {
        console.log('[PushNotificationService] Notifications enabled, registering...');
        await this.registerPushNotifications();
      }

      // Initialize local notifications for in-app handling
      await this.initializeLocalNotifications();
    } else {
      console.log('[PushNotificationService] Not a native platform, skipping native initialization');
    }

    this.initialized = true;
    console.log('[PushNotificationService] Initialization complete');
  }

  /**
   * Enable push notifications
   * @returns true if successfully enabled
   */
  public async enable(): Promise<boolean> {
    console.log('[PushNotificationService] Attempting to enable notifications');

    if (!Capacitor.isNativePlatform()) {
      console.log('[PushNotificationService] Not a native platform, cannot enable notifications');
      return false;
    }
    if (!this.userId) {
      console.log('[PushNotificationService] No user ID, cannot enable notifications');
      return false;
    }

    try {
      // Request permission first
      console.log('[PushNotificationService] Requesting permissions...');
      const permission = await PushNotifications.requestPermissions();
      console.log('[PushNotificationService] Permission result:', permission);

      if (permission.receive !== 'granted') {
        console.log('[PushNotificationService] Permission denied, showing settings prompt');
        // Permission denied, handle error internally
        await this.handlePermissionError();
        return false;
      }

      // Permission granted, proceed with registration
      console.log('[PushNotificationService] Permission granted, registering...');
      await this.registerPushNotifications();
      this.enabled = true;
      console.log('[PushNotificationService] Successfully enabled notifications');
      return true;
    } catch (error) {
      console.error('[PushNotificationService] Error in enable():', error);
      await this.handlePermissionError();
      return false;
    }
  }

  /**
   * Disable push notifications
   */
  public async disable(): Promise<void> {
    console.log('[PushNotificationService] Attempting to disable notifications');

    if (!Capacitor.isNativePlatform()) {
      console.log('[PushNotificationService] Not a native platform, skipping disable');
      return;
    }
    if (!this.userId) {
      console.log('[PushNotificationService] No user ID, skipping disable');
      return;
    }

    try {
      await this.unregisterPushNotifications();
      this.enabled = false;
      console.log('[PushNotificationService] Successfully disabled notifications');
    } catch (error) {
      console.error('[PushNotificationService] Error in disable():', error);
      throw error;
    }
  }

  /**
   * Check if push notifications are currently enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
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
      console.log('[PushNotificationService] Registering with FCM...');
      // Register with FCM
      await PushNotifications.register();
      console.log('[PushNotificationService] Successfully registered with FCM');

      // Listen for registration token
      PushNotifications.addListener('registration', (token: Token) => {
        console.log('[PushNotificationService] Got registration token:', token.value);
        this.savePushToken(token.value);
      });

      // Listen for push notification received
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('[PushNotificationService] Push notification received:', notification);
        this.notifyListeners(notification);
      });

      // Listen for push notification action performed
      PushNotifications.addListener('pushNotificationActionPerformed', (action: PushActionPerformed) => {
        console.log('[PushNotificationService] Push notification action performed:', action);
        // Also notify listeners of the action
        if (action.notification) {
          this.notifyListeners(action.notification);
        }
      });
    } catch (error) {
      console.error('[PushNotificationService] Error in registerPushNotifications():', error);
      throw error;
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

  /**
   * Open device settings for push notifications
   * @returns true if settings were opened successfully
   */
  private async openNotificationSettings(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      if (Capacitor.getPlatform() === 'ios') {
        await NativeSettings.openIOS({
          option: IOSSettings.App
        });
        return true;
      } else if (Capacitor.getPlatform() === 'android') {
        await NativeSettings.openAndroid({
          option: AndroidSettings.ApplicationDetails
        });
        return true;
      }
    } catch (error) {
      console.error('Error opening notification settings:', error);
    }
    return false;
  }

  /**
   * Handle push notification permission error
   * @returns true if user was prompted to open settings
   */
  private async handlePermissionError(): Promise<boolean> {
    if (confirm('Push notifications are disabled. Would you like to enable them in settings?')) {
      return await this.openNotificationSettings();
    }
    return false;
  }
}