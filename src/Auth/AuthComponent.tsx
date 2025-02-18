import React from 'react';
import { User } from 'firebase/auth';

interface AuthProps {
  user: User | null;
  isAuthenticated: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  isProfileOpen: boolean;
  onToggleProfile: () => void;
  onSavePreferences: (prefs: UserPreferences) => Promise<void>;
}

interface AuthState {
  nickname: string;
  pushNotifications: boolean;
  isSubmitting: boolean;
  error: string | null;
}

interface UserPreferences {
  nickname: string;
  pushNotificationsEnabled: boolean;
}

class AuthComponent extends React.Component<AuthProps, AuthState> {
  private defaultProfileImage = './assets/imgs/profile_blank.jpg';

  constructor(props: AuthProps) {
    super(props);
    this.state = {
      nickname: props.user?.displayName || '',
      pushNotifications: false,
      isSubmitting: false,
      error: null
    };
  }

  private handleProfileSave = async () => {
    const { onSavePreferences } = this.props;
    const { nickname, pushNotifications } = this.state;

    this.setState({ isSubmitting: true, error: null });

    try {
      await onSavePreferences({
        nickname,
        pushNotificationsEnabled: pushNotifications
      });
      this.props.onToggleProfile();
    } catch (error) {
      this.setState({
        error: 'Failed to save preferences. Please try again.'
      });
    } finally {
      this.setState({ isSubmitting: false });
    }
  };

  private renderLoginButton() {
    return (
      <button
        className="auth-button"
        onClick={this.props.onSignIn}
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
        Sign In
      </button>
    );
  }

  private renderProfileButton() {
    const { user } = this.props;
    return (
      <div
        id="profile-container"
        onClick={this.props.onToggleProfile}
      >
        <img
          id="profile-image"
          src={user?.photoURL || this.defaultProfileImage}
          alt="Profile"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.src = this.defaultProfileImage;
          }}
        />
      </div>
    );
  }

  private renderProfileModal() {
    const { isProfileOpen, onToggleProfile, onSignOut } = this.props;
    const { nickname, pushNotifications, isSubmitting, error } = this.state;

    if (!isProfileOpen) return null;

    return (
      <div className="modal-overlay">
        <div className="profile-modal">
          <h2>Profile Settings</h2>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="nickname">Nickname</label>
            <input
              type="text"
              id="nickname"
              value={nickname}
              onChange={(e) => this.setState({ nickname: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={pushNotifications}
                onChange={(e) => this.setState({
                  pushNotifications: e.target.checked
                })}
              />
              Enable Push Notifications
            </label>
          </div>

          <div className="button-group">
            <button
              onClick={this.handleProfileSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>

            <button
              onClick={onSignOut}
              className="sign-out-button"
            >
              Sign Out
            </button>

            <button
              onClick={onToggleProfile}
              className="cancel-button"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  render() {
    const { isAuthenticated } = this.props;

    return (
      <div className="auth-container">
        {isAuthenticated ? this.renderProfileButton() : this.renderLoginButton()}
        {this.renderProfileModal()}
      </div>
    );
  }
}

export default AuthComponent;