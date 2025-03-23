import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed as PushActionPerformed } from '@capacitor/push-notifications';
import { FirebaseService } from './FirebaseService';
import { UserPreferences } from '../types';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';

// Notification listener type
export type NotificationListener = (notification: PushNotificationSchema) => void;

export class PushNotificationService {
  private static instance: PushNotificationService;
  private initialized = false;
  private listeners: NotificationListener[] = [];
  private permissionCallbacks: ((isGranted: boolean) => void)[] = [];
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

      // Check actual permission status and update our state
      await this.syncPermissionStatus();
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

      // Update the user's preferences in Firestore
      await FirebaseService.updatePushNotificationSetting(this.userId, true);

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
   * @returns true if successfully disabled
   */
  public async disable(): Promise<boolean> {
    console.log('[PushNotificationService] Attempting to disable notifications');

    if (!Capacitor.isNativePlatform()) {
      console.log('[PushNotificationService] Not a native platform, skipping disable');
      return true; // Consider it successful on non-native platforms
    }
    if (!this.userId) {
      console.log('[PushNotificationService] No user ID, skipping disable');
      return true; // Consider it successful if there's no user ID
    }

    try {
      // Check current permission status
      const permissionStatus = await PushNotifications.checkPermissions();
      const isPermissionGranted = permissionStatus.receive === 'granted';

      if (isPermissionGranted) {
        console.log('[PushNotificationService] Notifications are currently enabled, showing settings prompt');
        // Show settings prompt to disable notifications
        if (confirm('Would you like to disable push notifications in settings?')) {
          const settingsOpened = await this.openNotificationSettings();
          if (!settingsOpened) {
            console.log('[PushNotificationService] Failed to open settings');
            return false;
          }
        } else {
          console.log('[PushNotificationService] User cancelled disabling notifications');
          return false;
        }
      }

      // Unregister push notifications
      await this.unregisterPushNotifications();

      // Update the user's preferences in Firestore
      await FirebaseService.updatePushNotificationSetting(this.userId, false);

      this.enabled = false;
      console.log('[PushNotificationService] Successfully disabled notifications');
      return true;
    } catch (error) {
      console.error('[PushNotificationService] Error in disable():', error);
      return false;
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
   * Add a listener for permission changes
   */
  public addPermissionChangeListener(callback: (isGranted: boolean) => void): void {
    this.permissionCallbacks.push(callback);
  }

  /**
   * Remove a permission change listener
   */
  public removePermissionChangeListener(callback: (isGranted: boolean) => void): void {
    const index = this.permissionCallbacks.indexOf(callback);
    if (index !== -1) {
      this.permissionCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify permission change listeners
   */
  private notifyPermissionListeners(isGranted: boolean): void {
    this.permissionCallbacks.forEach(callback => {
      try {
        callback(isGranted);
      } catch (error) {
        console.error('[PushNotificationService] Error in permission callback:', error);
      }
    });
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

        // Notification of permission granted - registration only happens when permissions are granted
        this.notifyPermissionListeners(true);
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
      console.log(`[PushNotificationService] Unregistering push notifications for user ${this.userId}`);

      // Get existing tokens
      const tokens = await FirebaseService.getUserPushTokens(this.userId);
      console.log(`[PushNotificationService] Found ${tokens.length} tokens to delete`);

      // Delete all tokens for this user
      for (const token of tokens) {
        console.log(`[PushNotificationService] Deleting token: ${token.id}`);
        await FirebaseService.deletePushToken(token.id);
      }

      // Remove all listeners
      PushNotifications.removeAllListeners();
      console.log('[PushNotificationService] Removed all push notification listeners');
    } catch (error) {
      console.error('[PushNotificationService] Error unregistering push notifications:', error);
      throw error;
    }
  }

  /**
   * Save the push notification token to Firebase
   */
  private async savePushToken(token: string): Promise<void> {
    if (!this.userId) {
      console.log('[PushNotificationService] No user ID, cannot save push token');
      return;
    }

    try {
      // Determine platform
      const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
      console.log(`[PushNotificationService] Saving push token for user ${this.userId} on platform ${platform}`);

      // Save the token to Firebase
      await FirebaseService.saveUserPushToken(this.userId, token, platform);
      console.log('[PushNotificationService] Successfully saved push token to Firebase');
    } catch (error) {
      console.error('[PushNotificationService] Error saving push token:', error);
    }
  }

  /**
   * Notify all listeners of a notification
   */
  private notifyListeners(notification: PushNotificationSchema): void {
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
    const action = this.enabled ? 'disable' : 'enable';
    if (confirm(`Would you like to ${action} push notifications in settings?`)) {
      return await this.openNotificationSettings();
    }
    return false;
  }

  /**
   * Check the actual device permission status and sync with our internal state
   * @returns The current permission status (true if granted, false if denied)
   */
  public async syncPermissionStatus(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || !this.userId) {
      return this.enabled;
    }

    try {
      console.log('[PushNotificationService] Checking actual permission status');
      const permissionStatus = await PushNotifications.checkPermissions();
      const isPermissionGranted = permissionStatus.receive === 'granted';

      console.log(`[PushNotificationService] Device permission status: ${isPermissionGranted ? 'granted' : 'denied'}`);

      // If our internal state doesn't match the actual permission, update it
      if (this.enabled !== isPermissionGranted) {
        console.log(`[PushNotificationService] Syncing permission status: ${isPermissionGranted}`);
        this.enabled = isPermissionGranted;

        // Notify listeners about the permission change
        this.notifyPermissionListeners(isPermissionGranted);

        // Update the database to match the actual permission status
        if (this.userId) {
          await FirebaseService.updatePushNotificationSetting(this.userId, isPermissionGranted);
        }
      }

      return isPermissionGranted;
    } catch (error) {
      console.error('[PushNotificationService] Error checking permission status:', error);
      return this.enabled;
    }
  }
}