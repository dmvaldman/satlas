import React from 'react';
import { User } from 'firebase/auth';
import { UserPreferences } from '../types';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

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
}

class ProfileModal extends React.Component<ProfileModalProps, ProfileModalState> {
  constructor(props: ProfileModalProps) {
    super(props);

    // Make sure preferences exists before accessing its properties
    const preferences = props.preferences || {};

    this.state = {
      username: preferences.username || '',
      pushNotifications: preferences.pushNotificationsEnabled || false,
      isSubmitting: false,
      isCheckingUsername: false,
      error: null,
      usernameError: null
    };
  }

  componentDidMount() {
    // If no username is set, generate one based on the user's name
    if (!this.state.username && this.props.user) {
      this.generateUniqueUsername();
    }
  }

  private generateUniqueUsername = async () => {
    const { user } = this.props;
    if (!user) return;

    // Get first name from displayName or email
    let baseName = '';
    if (user.displayName) {
      baseName = user.displayName.split(' ')[0];
    } else if (user.email) {
      baseName = user.email.split('@')[0];
    } else {
      baseName = 'user';
    }

    // Clean up the name (remove special chars, lowercase)
    baseName = baseName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Try the base name first
    let uniqueName = baseName;
    let counter = 1;

    // Keep trying until we find a unique name
    while (await this.isUsernameTaken(uniqueName)) {
      uniqueName = `${baseName}${counter}`;
      counter++;
    }

    this.setState({ username: uniqueName });
  }

  private isUsernameTaken = async (username: string): Promise<boolean> => {
    // Skip check if it's the user's current username
    const originalUsername = this.props.preferences?.username || '';
    if (username === originalUsername) {
      return false;
    }

    try {
      const userPrefsRef = collection(db, 'userPreferences');
      const q = query(userPrefsRef, where('username', '==', username));
      const querySnapshot = await getDocs(q);

      return !querySnapshot.empty;
    } catch (error) {
      console.error('Error checking username:', error);
      return false; // Assume it's not taken if there's an error
    }
  }

  private handleUsernameChange = async (username: string) => {
    this.setState({
      username,
      usernameError: null
    });

    // Don't check empty usernames or if it's the original
    if (!username || username === this.state.username) {
      return;
    }

    // Basic validation
    if (username.length < 3) {
      this.setState({ usernameError: 'Username must be at least 3 characters' });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      this.setState({ usernameError: 'Only letters, numbers, and underscores allowed' });
      return;
    }

    // Check if username is taken
    this.setState({ isCheckingUsername: true });
    const isTaken = await this.isUsernameTaken(username);
    this.setState({
      isCheckingUsername: false,
      usernameError: isTaken ? 'This username is already taken' : null
    });
  }

  private handleSave = async () => {
    const { onSave, onClose, preferences, user } = this.props;
    const { username, pushNotifications, usernameError } = this.state;

    // Don't save if there's a username error
    if (usernameError) {
      return;
    }

    // Basic validation
    if (!username || username.length < 3) {
      this.setState({ usernameError: 'Please enter a valid username (min 3 characters)' });
      return;
    }

    this.setState({ isSubmitting: true, error: null });

    try {
      // Final check to make sure username isn't taken
      const isTaken = await this.isUsernameTaken(username);
      if (isTaken) {
        this.setState({
          usernameError: 'This username is already taken',
          isSubmitting: false
        });
        return;
      }

      // Check if username has changed
      const originalUsername = preferences?.username || '';
      const usernameChanged = username !== originalUsername;

      // If username changed and user exists, update all their images
      if (usernameChanged && user) {
        await this.updateUserImagesWithNewUsername(user.uid, username);
      }

      // Save user preferences
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
      // Query all images uploaded by this user
      const imagesRef = collection(db, 'images');
      const q = query(imagesRef, where('userId', '==', userId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return; // No images to update
      }

      // Use a batch write for efficiency
      const batch = writeBatch(db);

      // Add each image document to the batch update
      querySnapshot.forEach((imageDoc) => {
        batch.update(doc(db, 'images', imageDoc.id), {
          userName: newUsername
        });
      });

      // Commit the batch
      await batch.commit();
      console.log(`Updated userName in ${querySnapshot.size} images`);
    } catch (error) {
      console.error('Error updating images with new username:', error);
      throw error; // Propagate the error to be handled by the caller
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
      usernameError
    } = this.state;

    if (!isOpen) return null;

    return (
      <div
        className="modal-overlay active"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="profile-content">
          <h2>Profile Settings</h2>

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
        </div>
      </div>
    );
  }
}

export default ProfileModal;