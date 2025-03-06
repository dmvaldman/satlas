import React from 'react';
import { User } from 'firebase/auth';
import { UserPreferences } from '../types';
import { FirebaseService } from '../services/FirebaseService';
import {
  isUsernameTaken,
  generateUniqueUsername,
  validateUsername,
} from '../utils/userUtils';

interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  preferences: UserPreferences;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onSave: (preferences: UserPreferences) => Promise<void>;
}

interface ProfileModalState {
  username: string;
  pushNotifications: boolean;
  isSubmitting: boolean;
  isCheckingUsername: boolean;
  error: string | null;
  usernameError: string | null;
  isLoading: boolean;
}

class ProfileModal extends React.Component<ProfileModalProps, ProfileModalState> {
  private static loadedUserIds = new Set<string>();

  constructor(props: ProfileModalProps) {
    super(props);

    const isDataCached = props.user && ProfileModal.loadedUserIds.has(props.user.uid);

    this.state = {
      username: '',
      pushNotifications: false,
      isSubmitting: false,
      isCheckingUsername: false,
      error: null,
      usernameError: null,
      isLoading: !isDataCached && !!props.user
    };
  }

  componentDidMount() {
    this.initializeFromProps();
  }

  componentDidUpdate(prevProps: ProfileModalProps) {
    if (prevProps.user !== this.props.user ||
        prevProps.preferences !== this.props.preferences) {
      this.initializeFromProps();
    }
  }

  private initializeFromProps() {
    const { user, preferences } = this.props;

    if (user && preferences) {
      this.setState({
        username: preferences.username || '',
        pushNotifications: preferences.pushNotificationsEnabled || false,
        isLoading: false
      });

      ProfileModal.loadedUserIds.add(user.uid);
    } else if (user && !preferences) {
      this.setState({ isLoading: true });
    }
  }

  public static clearCache(userId: string) {
    ProfileModal.loadedUserIds.delete(userId);
  }

  public static clearAllCache() {
    ProfileModal.loadedUserIds.clear();
  }

  private generateUniqueUsername = async () => {
    const { user } = this.props;
    if (!user) return;

    const username = await generateUniqueUsername(
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

    const validation = validateUsername(username);
    if (!validation.isValid) {
      this.setState({ usernameError: validation.error || null });
      return;
    }

    this.setState({ isCheckingUsername: true });
    const isTaken = await isUsernameTaken(
      username,
      this.props.user?.uid,
      originalUsername
    );

    this.setState({
      isCheckingUsername: false,
      usernameError: isTaken ? 'This username is already taken' : null
    });
  }

  private handleSave = async () => {
    const { onSave, onClose, preferences, user } = this.props;
    const { username, pushNotifications, usernameError } = this.state;

    if (usernameError) {
      return;
    }

    if (!username || username.length < 3) {
      this.setState({ usernameError: 'Please enter a valid username (min 3 characters)' });
      return;
    }

    this.setState({ isSubmitting: true, error: null });

    try {
      const isTaken = await isUsernameTaken(username, user?.uid, preferences?.username);
      if (isTaken) {
        this.setState({
          usernameError: 'This username is already taken',
          isSubmitting: false
        });
        return;
      }

      const originalUsername = preferences?.username || '';
      const usernameChanged = username !== originalUsername;

      if (usernameChanged && user) {
        await this.updateUserImagesWithNewUsername(user.uid, username);
      }

      await onSave({
        username,
        pushNotificationsEnabled: pushNotifications,
        lastVisit: Date.now()
      });

      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      this.setState({
        error: 'Failed to save preferences. Please try again.'
      });
    } finally {
      this.setState({ isSubmitting: false });
    }
  };

  private updateUserImagesWithNewUsername = async (userId: string, newUsername: string) => {
    try {
      await FirebaseService.updateUserImagesWithNewUsername(userId, newUsername);
    } catch (error) {
      console.error('Error updating images with new username:', error);
      throw error;
    }
  };

  render() {
    const { isOpen, onClose, onSignOut } = this.props;
    const {
      username,
      pushNotifications,
      isSubmitting,
      isCheckingUsername,
      error,
      usernameError,
      isLoading
    } = this.state;

    if (!isOpen) return null;

    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="profile-content" onClick={e => e.stopPropagation()}>
          <h2>Profile Settings</h2>

          {isLoading ? (
            <div className="loading-indicator">
              <div className="spinner"></div>
              <p>Loading profile data...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <div className="profile-section">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => this.handleUsernameChange(e.target.value)}
                  placeholder="Enter username"
                  className={usernameError ? 'error' : ''}
                />
                {isCheckingUsername && <div className="checking-message">Checking availability...</div>}
                {usernameError && <div className="error-message">{usernameError}</div>}
                <div className="help-text">
                  Your username must be unique and will be visible to other users.
                </div>
              </div>

              <div className="profile-section">
                <label className="toggle-label">
                  <span>Enable Push Notifications</span>
                  <input
                    type="checkbox"
                    checked={pushNotifications}
                    onChange={(e) => this.setState({
                      pushNotifications: e.target.checked
                    })}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="profile-actions">
                <button
                  className="profile-button primary"
                  onClick={this.handleSave}
                  disabled={isSubmitting || !!usernameError}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="profile-button"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>

              <div className="profile-section logout-section">
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
            </>
          )}
        </div>
      </div>
    );
  }
}

export default ProfileModal;