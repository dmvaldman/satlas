import React from 'react';
import { User } from 'firebase/auth';
import { UserPreferences } from '../types';
import { FirebaseService } from '../services/FirebaseService';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { PushNotificationService } from '../services/PushNotificationService';


interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  preferences: UserPreferences;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onSave: (preferences: UserPreferences) => Promise<void>;
  onUpdatePreferences: (preferences: UserPreferences) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

interface ProfileModalState {
  username: string;
  pushNotifications: boolean;
  isSubmitting: boolean;
  usernameError: string | null;
  isLoading: boolean;
}

class ProfileModal extends React.Component<ProfileModalProps, ProfileModalState> {
  private static loadedUserIds = new Set<string>();
  private inputRef = React.createRef<HTMLInputElement>();
  private contentRef = React.createRef<HTMLDivElement>();
  private keyboardListenersAdded = false;

  constructor(props: ProfileModalProps) {
    super(props);

    const isDataCached = props.user && ProfileModal.loadedUserIds.has(props.user.uid);

    this.state = {
      username: '',
      pushNotifications: false,
      isSubmitting: false,
      usernameError: null,
      isLoading: !isDataCached && !!props.user
    };
  }

  componentDidMount() {
    this.initializeFromProps();

    if (Capacitor.isNativePlatform() && !this.keyboardListenersAdded) {
      this.setupKeyboardListeners();
    }

    // Initialize notification service if user is available
    this.initializeNotificationService();

    // Add a safety timeout to prevent infinite loading
    setTimeout(() => {
      if (this.state.isLoading) {
        console.log('[ProfileModal] Safety timeout triggered, forcing loading to complete');
        this.setState({
          isLoading: false
        });
      }
    }, 5000);

    // Initialize animation
    if (this.contentRef.current) {
      // Trigger reflow
      void this.contentRef.current.offsetHeight;
      this.contentRef.current.classList.add('active');
    }
  }

  componentDidUpdate(prevProps: ProfileModalProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      // Modal is opening
      if (this.contentRef.current) {
        // Trigger reflow
        void this.contentRef.current.offsetHeight;
        this.contentRef.current.classList.add('active');
      }

      // Re-initialize notification service when modal opens with a different user
      if (prevProps.user?.uid !== this.props.user?.uid) {
        this.initializeNotificationService();
      }
    } else if (prevProps.isOpen && !this.props.isOpen) {
      // Modal is closing
      if (this.contentRef.current) {
        this.contentRef.current.classList.remove('active');
      }
    }

    if (prevProps.user !== this.props.user ||
        prevProps.preferences !== this.props.preferences) {
      this.initializeFromProps();
    }
  }

  componentWillUnmount() {
    if (Capacitor.isNativePlatform() && this.keyboardListenersAdded) {
      this.removeKeyboardListeners();
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

  private handleKeyboardShow = (info: { keyboardHeight: number }) => {
    if (this.contentRef.current) {
      this.contentRef.current.classList.add('keyboard-visible');

      setTimeout(() => {
        this.inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      preferences,
      isLoading: this.state.isLoading
    });

    if (user) {
      // We have a user, check if we have preferences
      if (preferences) {
        // We have preferences, update state and stop loading
        this.setState({
          username: preferences.username,
          pushNotifications: preferences.pushNotificationsEnabled,
          isLoading: false
        });

        // Cache this user ID as loaded
        ProfileModal.loadedUserIds.add(user.uid);

        // If no username is set but we have a display name, generate one
        if (!preferences.username && user.displayName) {
          this.generateUniqueUsername();
        }
      } else {
        // No preferences yet, but we'll use display name as a starting point
        this.setState({
          pushNotifications: false,
          isLoading: false // Stop loading even without preferences
        });

        // Try to generate a username from display name
        if (user.displayName) {
          this.generateUniqueUsername();
        }
      }
    } else {
      // No user, stop loading
      this.setState({ isLoading: false });
    }
  }

  private generateUniqueUsername = async () => {
    const { user } = this.props;
    if (!user) return;

    const username = await FirebaseService.generateUniqueUsername(
      user.uid,
      user.displayName
    );

    this.setState({ username });
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

  private saveInBackground = async (data: {
    username: string;
    pushNotifications: boolean;
    preferences: UserPreferences | undefined;
  }) => {
    const { username, pushNotifications, preferences } = data;
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
        await FirebaseService.updateUserImagesWithNewUsername(user.uid, username);
      }

      // Create the updated preferences object
      const updatedPreferences: UserPreferences = {
        username,
        pushNotificationsEnabled: pushNotifications,
        lastVisit: Date.now()
      };

      // Save to Firebase
      await FirebaseService.saveUserPreferences(user?.uid || '', updatedPreferences);

      // Important: Update the state in the parent component
      this.props.onUpdatePreferences(updatedPreferences);

      // Don't show success notification - only notify on failure
    } catch (error) {
      console.error('Error saving profile in background:', error);
      showNotification('Failed to save profile settings. Please try again.', 'error');
    }
  };

  // Add a method to initialize the notification service
  private initializeNotificationService = async () => {
    const { user, preferences } = this.props;

    if (user && Capacitor.isNativePlatform()) {
      try {
        const notificationService = PushNotificationService.getInstance();
        console.log('[ProfileModal] Initializing notification service on mount/update');
        await notificationService.initialize(user.uid, preferences || { username: '', pushNotificationsEnabled: false });
      } catch (error) {
        console.error('[ProfileModal] Error initializing notification service:', error);
      }
    }
  }

  private handlePushNotificationToggle = async (enabled: boolean) => {
    const { user, showNotification, preferences } = this.props;
    console.log('[ProfileModal] Toggle notifications:', enabled);

    if (!user) {
      console.log('[ProfileModal] No user, cannot toggle notifications');
      return;
    }

    try {
      const notificationService = PushNotificationService.getInstance();

      // Service should already be initialized, just enable or disable
      let success: boolean;

      if (enabled) {
        console.log('[ProfileModal] Attempting to enable notifications');
        success = await notificationService.enable();
        console.log('[ProfileModal] Enable result:', success);
      } else {
        console.log('[ProfileModal] Attempting to disable notifications');
        success = await notificationService.disable();
        console.log('[ProfileModal] Disable result:', success);
      }

      if (success) {
        console.log('[ProfileModal] Operation successful, updating state and preferences');
        // Update local state and preferences only after successful operation
        this.setState({ pushNotifications: enabled });
        const updatedPreferences = {
          ...this.props.preferences,
          pushNotificationsEnabled: enabled
        };
        this.props.onUpdatePreferences(updatedPreferences);
      } else {
        console.log('[ProfileModal] Operation failed, not updating state');
      }
    } catch (error) {
      console.error('[ProfileModal] Error in handlePushNotificationToggle:', error);
      showNotification('Failed to update push notification settings', 'error');
    }
  };

  render() {
    const { isOpen, onClose, onSignOut } = this.props;
    const {
      username,
      pushNotifications,
      isSubmitting,
      usernameError,
      isLoading
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
      if (usernameError || isSubmitting || isLoading) {
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

      // Only save if something changed
      if (usernameChanged || notificationsChanged) {
        // Save in the background - modal is already closed
        this.saveInBackground({
          username,
          pushNotifications,
          preferences
        });
      }
    };

    return (
      <div
        className="modal-overlay"
        onClick={(e) => handleClose(e)}
      >
        <div
          className="modal-content profile-content"
          onClick={e => e.stopPropagation()}
          ref={this.contentRef}
        >
          <h2>Profile Settings</h2>

          {isLoading ? (
            <div className="loading-indicator">
              <div className="spinner"></div>
              <p>Loading profile data...</p>
            </div>
          ) : (
            <>
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
                <label className="toggle-label">
                  <span>Enable Push Notifications</span>
                  <input
                    type="checkbox"
                    checked={pushNotifications}
                    onChange={(e) => this.handlePushNotificationToggle(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

            </>
          )}

          <div className="profile-section">
            <button
              className="profile-button danger"
              onClick={async () => {
                await onSignOut();
                onClose();
              }}
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ProfileModal;