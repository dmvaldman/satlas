import React from 'react';
import { User, UserPreferences, Location } from '../types';
import { FirebaseService } from '../services/FirebaseService';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { PushNotificationService } from '../services/PushNotificationService';
import mapboxgl from 'mapbox-gl';
import { App } from '@capacitor/app';

interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  preferences: UserPreferences;
  currentLocation?: Location | null;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onSave: (preferences: UserPreferences) => Promise<void>;
  onUpdatePreferences: (preferences: UserPreferences) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

interface ProfileModalState {
  username: string;
  pushNotifications: boolean;
  city: string;
  cityCoordinates: Location | null;
  cityTopResult: string | null;
  isSubmitting: boolean;
  usernameError: string | null;
  isActive: boolean;
}

class ProfileModal extends React.Component<ProfileModalProps, ProfileModalState> {
  private static loadedUserIds = new Set<string>();
  private inputRef = React.createRef<HTMLInputElement>();
  private cityInputRef = React.createRef<HTMLInputElement>();
  private contentRef = React.createRef<HTMLDivElement>();
  private keyboardListenersAdded = false;
  private notificationService: PushNotificationService | null = null;
  private permissionChangeHandler: ((isGranted: boolean) => void) | null = null;
  private appStateListenerHandle: { remove: () => void } | null = null;

  constructor(props: ProfileModalProps) {
    super(props);

    this.state = {
      username: '',
      city: '',
      cityCoordinates: null,
      cityTopResult: null,
      pushNotifications: false,
      isSubmitting: false,
      usernameError: null,
      isActive: false
    };

    // Create the permission change handler bound to this instance
    this.permissionChangeHandler = this.handlePermissionChange.bind(this);
  }

  componentDidMount() {
    this.initializeFromProps();

    if (Capacitor.isNativePlatform() && !this.keyboardListenersAdded) {
      this.setupKeyboardListeners();
    }

    // Initialize notification service if user is available
    this.initializeNotificationService();

    // Sync the toggle state with actual device permissions
    this.syncNotificationToggleState();

    // Add app resume listener for when returning from system settings
    if (Capacitor.isNativePlatform()) {
      this.setupAppStateListener();
    }

    // Set to active after a small delay to ensure initial transform is applied
    if (this.props.isOpen) {
      requestAnimationFrame(() => {
        this.setState({ isActive: true });
      });
    }

    // If we have coordinates, resolve them to a city name
    if (this.props.preferences?.cityCoordinates) {
      this.getCityFromCoordinates(this.props.preferences.cityCoordinates);
    }
  }

  componentDidUpdate(prevProps: ProfileModalProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      // Modal is opening
      console.log('[ProfileModal] Modal opening, re-initializing notification service');

      // Re-initialize notification service when modal opens with a different user
      if (prevProps.user?.uid !== this.props.user?.uid) {
        this.initializeNotificationService();
      }

      // Sync the toggle state with actual device permissions
      this.syncNotificationToggleState();

      // Set to active after a small delay to ensure initial transform is applied
      requestAnimationFrame(() => {
        this.setState({ isActive: true });
      });

      // If we have coordinates, resolve them to a city name
      if (this.props.preferences?.cityCoordinates && !this.state.city) {
        this.getCityFromCoordinates(this.props.preferences.cityCoordinates);
      }
    } else if (prevProps.isOpen && !this.props.isOpen) {
      // Modal is closing
      requestAnimationFrame(() => {
        this.setState({ isActive: false });
      });
    }

    if (prevProps.user !== this.props.user ||
        prevProps.preferences !== this.props.preferences) {
      this.initializeFromProps();
    }

    // If preferences changed and we have coordinates, resolve them to a city name
    if (prevProps.preferences !== this.props.preferences &&
        this.props.preferences?.cityCoordinates &&
        !this.state.city) {
      this.getCityFromCoordinates(this.props.preferences.cityCoordinates);
    }
  }

  componentWillUnmount() {
    if (Capacitor.isNativePlatform() && this.keyboardListenersAdded) {
      this.removeKeyboardListeners();
    }

    // Remove permission change listener and clean up notification service
    this.cleanupNotificationService();

    // Remove app resume listener - only remove our specific listener
    if (this.appStateListenerHandle) {
      this.appStateListenerHandle.remove();
      this.appStateListenerHandle = null;
      console.log('[ProfileModal] App state listener removed');
    }
  }

  private setupKeyboardListeners() {
    Keyboard.addListener('keyboardWillShow', this.handleKeyboardShow);
    Keyboard.addListener('keyboardWillHide', this.handleKeyboardHide);
    this.keyboardListenersAdded = true;
  }

  private removeKeyboardListeners() {
    Keyboard.removeAllListeners();
    this.keyboardListenersAdded = false;
  }

  private handleKeyboardShow = () => {
    if (this.contentRef.current) {
      this.contentRef.current.classList.add('keyboard-visible');

      setTimeout(() => {
        // Determine which input is active and scroll to it
        const activeElement = document.activeElement;
        if (activeElement && (activeElement === this.inputRef.current || activeElement === this.cityInputRef.current)) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  private handleKeyboardHide = () => {
    if (this.contentRef.current) {
      this.contentRef.current.classList.remove('keyboard-visible');
    }
  };

  private initializeFromProps() {
    const { user, preferences } = this.props;

    console.log('[ProfileModal] initializeFromProps:', {
      user: user?.uid,
      preferences
    });

    if (user) {
      // We have a user, check if we have preferences
      if (preferences) {
        // We have preferences, update state and stop loading
        this.setState({
          username: preferences.username,
          pushNotifications: preferences.pushNotificationsEnabled,
          cityCoordinates: preferences.cityCoordinates || null
        });

        // Cache this user ID as loaded
        ProfileModal.loadedUserIds.add(user.uid);

        // If we have coordinates, resolve them to a city name
        if (preferences.cityCoordinates) {
          this.getCityFromCoordinates(preferences.cityCoordinates);
        }
      } else {
        // No preferences yet
        this.setState({
          pushNotifications: false,
          cityCoordinates: null
        });
      }
    }
  }

  private handleUsernameChange = async (username: string) => {
    this.setState({
      username,
      usernameError: null
    });

    const originalUsername = this.props.preferences?.username;
    if (!username || username === originalUsername) {
      return;
    }

    const validation = this.validateUsername(username);
    if (!validation.isValid) {
      this.setState({ usernameError: validation.error || null });
      return;
    }

    const isTaken = await FirebaseService.isUsernameTaken(
      username,
      this.props.user?.uid,
      originalUsername
    );

    this.setState({
      usernameError: isTaken ? 'This username is already taken' : null
    });
  }

  private validateUsername = (username: string): { isValid: boolean; error?: string } => {
    if (!username || username.length < 3) {
      return {
        isValid: false,
        error: 'Username must be at least 3 characters'
      };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return {
        isValid: false,
        error: 'Only letters, numbers, and underscores allowed'
      };
    }

    return { isValid: true };
  };

  private handleCityChange = (city: string) => {
    this.setState({ city });

    // Only search if there's at least 3 characters
    if (city.length >= 3) {
      this.searchCities(city);
    } else {
      this.setState({ cityTopResult: null });
    }
  };

  private searchCities = async (query: string) => {
    try {
      // Use Mapbox geocoding API to search for cities
      const accessToken = mapboxgl.accessToken;
      const types = 'place'; // Limit to places (cities, towns)
      const country = 'us'; // Prefer US results
      const limit = 1; // We only need the top result

      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${accessToken}&types=${types}&country=${country}&limit=${limit}`;

      const response = await fetch(url);
      const data = await response.json();

      // Extract only the top result
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const topResult = feature.place_name;

        this.setState({
          cityTopResult: topResult
        });
      } else {
        this.setState({ cityTopResult: null });
      }
    } catch (error) {
      console.error('Error searching cities:', error);
      this.setState({ cityTopResult: null });
    }
  };

  private handleCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { city, cityTopResult } = this.state;

    // If Tab is pressed and we have a top result that starts with what the user typed
    if (e.key === 'Tab' && cityTopResult &&
        cityTopResult.toLowerCase().startsWith(city.toLowerCase())) {
      e.preventDefault(); // Prevent default tab behavior

      // First update the UI with the selected city name
      this.setState({
        city: cityTopResult,
        cityTopResult: null
      });

      // Then get coordinates for this city name
      this.getCoordinatesFromCity(cityTopResult);
    }
  };

  // New method to get coordinates from a city name
  private getCoordinatesFromCity = async (cityName: string) => {
    try {
      // Use Mapbox geocoding API to get coordinates from city name
      const accessToken = mapboxgl.accessToken;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cityName)}.json?access_token=${accessToken}&types=place&limit=1`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const coordinates = data.features[0].center; // [longitude, latitude]
        this.setState({
          cityCoordinates: {
            latitude: coordinates[1],
            longitude: coordinates[0]
          }
        });
      }
    } catch (error) {
      console.error('Error getting coordinates from city:', error);
    }
  };

  private getCityFromCoordinates = async (location: Location) => {
    try {
      // Use Mapbox reverse geocoding to get city name from coordinates
      const accessToken = mapboxgl.accessToken;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${location.longitude},${location.latitude}.json?access_token=${accessToken}&types=place`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        // Get the first place result
        const city = data.features[0].place_name;
        this.setState({ city });
      }
    } catch (error) {
      console.error('Error getting city from coordinates:', error);
    }
  };

  private saveInBackground = async (data: {
    username: string;
    pushNotifications: boolean;
    cityCoordinates: Location | null;
    preferences: UserPreferences | undefined;
  }) => {
    const { username, pushNotifications, cityCoordinates, preferences } = data;
    const { user, showNotification } = this.props;

    try {
      // Check if username is taken
      const isTaken = await FirebaseService.isUsernameTaken(username, user?.uid, preferences?.username);
      if (isTaken) {
        showNotification('Username is already taken. Changes were not saved.', 'error');
        return;
      }

      const originalUsername = preferences?.username || '';
      const usernameChanged = username !== originalUsername;

      // Update images with new username if needed
      if (usernameChanged && user) {
        await FirebaseService.updateUserWithNewUsername(user.uid, username);
      }

      // Create the updated preferences object
      const updatedPreferences: UserPreferences = {
        username,
        pushNotificationsEnabled: pushNotifications,
        lastVisit: Date.now(),
        cityCoordinates: cityCoordinates || undefined
      };

      // Save to Firebase
      await FirebaseService.saveUserPreferences(user?.uid || '', updatedPreferences);

      // Important: Update the state in the parent component
      this.props.onUpdatePreferences(updatedPreferences);

      showNotification('Profile settings saved', 'success');
    } catch (error) {
      console.error('Error saving profile in background:', error);
      showNotification('Failed to save profile settings. Please try again.', 'error');
    }
  };

  // Clean up notification service
  private cleanupNotificationService = () => {
    if (this.notificationService && this.permissionChangeHandler) {
      console.log('[ProfileModal] Cleaning up notification service');
      this.notificationService.removePermissionChangeListener(this.permissionChangeHandler);
      this.notificationService.cleanup();
      this.notificationService = null;
    }
  };

  // Handle app resuming from background (returning from system settings)
  private handleAppResume = () => {
    console.log('[ProfileModal] App resumed, re-initializing notification service');

    // Re-create notification service since the app might have refreshed
    this.cleanupNotificationService();
    this.initializeNotificationService();

    // Re-sync notification status immediately when app resumes
    this.syncNotificationToggleState();

    // If we have a user, make sure notification preferences are up to date
    if (this.props.user && this.props.preferences) {
      this.updateNotificationPreferencesIfNeeded();
    }
  };

  // Add a method to initialize the notification service
  private initializeNotificationService = async () => {
    const { user, preferences } = this.props;

    if (user && Capacitor.isNativePlatform()) {
      try {
        // Clean up any existing service first
        this.cleanupNotificationService();

        // Create a new instance instead of using the singleton
        this.notificationService = new PushNotificationService();

        console.log('[ProfileModal] Creating new notification service with userId:', user.uid);

        // Initialize the new instance
        await this.notificationService.initialize(user.uid, preferences || {
          username: '',
          pushNotificationsEnabled: false,
          lastVisit: Date.now()
        });

        // Add permission change listener to the new instance
        if (this.permissionChangeHandler) {
          this.notificationService.addPermissionChangeListener(this.permissionChangeHandler);
        }
      } catch (error) {
        console.error('[ProfileModal] Error initializing notification service:', error);
      }
    }
  }

  // Add a method to sync the notification toggle state with actual device permissions
  private syncNotificationToggleState = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        // If we don't have a notification service, create one
        if (!this.notificationService && this.props.user) {
          await this.initializeNotificationService();
        }

        // Skip if still no notification service
        if (!this.notificationService) return;

        console.log('[ProfileModal] Syncing notification toggle state with device permissions');

        // Get the actual permission status
        const isPermissionGranted = await this.notificationService.syncPermissionStatus();

        // Update our UI state to match
        if (this.state.pushNotifications !== isPermissionGranted) {
          console.log(`[ProfileModal] Updating toggle state to match device permissions: ${isPermissionGranted}`);
          this.setState({ pushNotifications: isPermissionGranted });
        }
      } catch (error) {
        console.error('[ProfileModal] Error syncing notification toggle state:', error);
      }
    }
  }

  // Add a method to update notification preferences if needed
  private updateNotificationPreferencesIfNeeded = async () => {
    const { user, preferences, onUpdatePreferences } = this.props;

    if (!user || !preferences || !this.notificationService) return;

    try {
      // Get the current permission status directly from the service
      const currentPermissionStatus = await this.notificationService.syncPermissionStatus();

      // If permission status doesn't match preferences, update preferences
      if (preferences.pushNotificationsEnabled !== currentPermissionStatus) {
        console.log(`[ProfileModal] Updating push notification preferences to match current status: ${currentPermissionStatus}`);

        const updatedPreferences = {
          ...preferences,
          pushNotificationsEnabled: currentPermissionStatus
        };

        // Save to Firebase
        await FirebaseService.saveUserPreferences(user.uid, updatedPreferences);

        // Update parent component state
        onUpdatePreferences(updatedPreferences);
      }
    } catch (error) {
      console.error('[ProfileModal] Error updating notification preferences:', error);
    }
  };

  private handlePushNotificationToggle = async (enabled: boolean) => {
    const { user, showNotification } = this.props;
    console.log('[ProfileModal] Toggle notifications:', enabled);

    if (!user) {
      console.log('[ProfileModal] No user, cannot toggle notifications');
      showNotification('You must be logged in to manage notifications', 'error');
      return;
    }

    // Make sure we have a notification service
    if (!this.notificationService) {
      await this.initializeNotificationService();
      if (!this.notificationService) {
        showNotification('Failed to initialize notification service', 'error');
        return;
      }
    }

    try {
      if (enabled) {
        console.log('[ProfileModal] Attempting to enable notifications');
        await this.notificationService.enable();
      } else {
        console.log('[ProfileModal] Attempting to disable notifications');
        await this.notificationService.disable();
      }

      // Get the actual permission status after the user interaction
      const actualStatus = await this.notificationService.syncPermissionStatus();
      console.log(`[ProfileModal] Post-toggle permission status: ${actualStatus}`);

      // Only update UI to reflect actual permission status
      this.setState({ pushNotifications: actualStatus });
    } catch (error) {
      console.error('[ProfileModal] Error in handlePushNotificationToggle:', error);
      showNotification('Failed to update push notification settings', 'error');
    }
  };

  // Helper method to save notification preference
  private saveNotificationPreference = async (userId: string, enabled: boolean) => {
    const { preferences, onUpdatePreferences } = this.props;

    if (!preferences) return;

    const updatedPreferences = {
      ...preferences,
      pushNotificationsEnabled: enabled
    };

    // Save to Firebase
    await FirebaseService.saveUserPreferences(userId, updatedPreferences);

    // Update parent component state
    onUpdatePreferences(updatedPreferences);
  };

  private handlePermissionChange = (isGranted: boolean) => {
    console.log('[ProfileModal] Permission change detected:', isGranted);

    // Update UI state
    this.setState({ pushNotifications: isGranted });

    // If user is available, update preferences to match actual permission
    if (this.props.user?.uid && this.props.preferences) {
      this.saveNotificationPreference(this.props.user.uid, isGranted);
    }
  }

  private setupAppStateListener = async () => {
    try {
      // Store the listener handle so we can remove it later
      this.appStateListenerHandle = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          this.handleAppResume();
        }
      });
      console.log('[ProfileModal] App state listener added');
    } catch (error) {
      console.error('[ProfileModal] Error setting up app state listener:', error);
    }
  }

  render() {
    const { isOpen, onClose, onSignOut, showNotification } = this.props;
    const {
      username,
      pushNotifications,
      city,
      cityTopResult,
      cityCoordinates,
      isSubmitting,
      usernameError,
      isActive
    } = this.state;

    if (!isOpen) return null;

    // Update the handleClose function to avoid event propagation issues
    const handleClose = (e?: React.MouseEvent) => {
      // Prevent event propagation
      if (e) {
        e.stopPropagation();
      }

      // First close the modal immediately
      onClose();

      // Don't try to save if there are validation errors or we're submitting
      if (usernameError || isSubmitting) {
        return;
      }

      // Don't save if username is too short
      if (!username || username.length < 3) {
        return;
      }

      // Check if anything changed
      const { preferences } = this.props;
      const usernameChanged = username !== (preferences?.username || '');
      const notificationsChanged = pushNotifications !== (preferences?.pushNotificationsEnabled || false);
      const cityChanged = JSON.stringify(cityCoordinates) !== JSON.stringify(preferences?.cityCoordinates);

      // Only save if something changed
      if (usernameChanged || notificationsChanged || cityChanged) {
        // Save in the background - modal is already closed
        this.saveInBackground({
          username,
          pushNotifications,
          cityCoordinates,
          preferences
        });
      }
    };

    // Calculate suggestion - only if the top result starts with what the user typed
    let suggestion = '';
    if (cityTopResult && city.length > 0 &&
        cityTopResult.toLowerCase().startsWith(city.toLowerCase())) {
      suggestion = cityTopResult;
    }

    return (
      <div
        className={`modal-overlay ${isOpen ? 'active' : ''}`}
        style={{ display: isOpen ? 'flex' : 'none' }}
        onClick={(e) => handleClose(e)}
      >
        <div
          className={`modal-content profile-content ${isActive ? 'active' : ''}`}
          onClick={e => e.stopPropagation()}
          ref={this.contentRef}
        >
          <h2>Profile Settings</h2>

          <div className="profile-section">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              ref={this.inputRef}
              value={username}
              onChange={(e) => this.handleUsernameChange(e.target.value)}
              placeholder="Enter username"
              className={usernameError ? 'error' : ''}
            />
            <div className={`error-message ${usernameError ? 'visible' : 'hidden'}`}>
              {usernameError || '\u00A0'}
            </div>
          </div>

          <div className="profile-section">
            <label htmlFor="city">Home City</label>
            <div className="city-input-container">
              <input
                type="text"
                id="city"
                ref={this.cityInputRef}
                value={city}
                onChange={(e) => this.handleCityChange(e.target.value)}
                onKeyDown={this.handleCityKeyDown}
                placeholder="Your city"
                autoComplete="off"
              />
              {suggestion && (
                <div className="city-suggestion">
                  {suggestion}
                </div>
              )}
            </div>
          </div>

          {Capacitor.isNativePlatform() && (
            <div className="profile-section">
              <label className="toggle-label">
                <span>Push Notifications Enabled</span>
                <input
                  type="checkbox"
                  checked={pushNotifications}
                  onChange={(e) => this.handlePushNotificationToggle(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          )}

          <div className="profile-section">
            <button
              className="profile-button danger"
              onClick={async () => {
                await onSignOut();
                onClose();
              }}
            >
              <span className="log-out-text">
                Log Out
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ProfileModal;