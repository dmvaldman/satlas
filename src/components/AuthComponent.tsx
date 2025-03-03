import React from 'react';
import { User } from 'firebase/auth';
import { UserPreferences } from '../types';
import ProfileModal from './ProfileModal';

interface AuthProps {
  user: User | null;
  isAuthenticated: boolean;
  isProfileOpen: boolean;
  userPreferences: UserPreferences;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onToggleProfile: () => void;
  onSavePreferences: (prefs: UserPreferences) => Promise<void>;
}

interface AuthState {
  error: string | null;
}

class AuthComponent extends React.Component<AuthProps, AuthState> {
  private defaultProfileImage = './assets/imgs/profile_blank.jpg';

  constructor(props: AuthProps) {
    super(props);
    this.state = {
      error: null
    };
  }

  private handleSignIn = async () => {
    try {
      await this.props.onSignIn();
    } catch (error) {
      console.error('Error signing in:', error);
      this.setState({ error: 'Failed to sign in. Please try again.' });
    }
  };

  private handleSignOut = async () => {
    try {
      await this.props.onSignOut();
    } catch (error) {
      console.error('Error signing out:', error);
      this.setState({ error: 'Failed to sign out. Please try again.' });
    }
  };

  private renderLoginButton() {
    return (
      <button
        className="auth-button"
        onClick={this.handleSignIn}
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
        Sign In
      </button>
    );
  }

  private renderProfileButton() {
    const { user, onToggleProfile } = this.props;
    if (!user) return null;

    return (
      <div
        id="profile-container"
        onClick={onToggleProfile}
      >
        <img
          id="profile-image"
          src={user.photoURL || this.defaultProfileImage}
          alt="Profile"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={(e) => {
            console.error('Image failed to load:', user.photoURL);
            const img = e.target as HTMLImageElement;
            img.src = this.defaultProfileImage;
          }}
        />
      </div>
    );
  }

  shouldComponentUpdate(nextProps: AuthProps, nextState: AuthState) {
    // Only update if these props/state have changed
    return (
      this.props.user !== nextProps.user ||
      this.props.isAuthenticated !== nextProps.isAuthenticated ||
      this.props.isProfileOpen !== nextProps.isProfileOpen ||
      this.state.error !== nextState.error
    );
  }

  render() {
    const { isAuthenticated, isProfileOpen, onToggleProfile, onSavePreferences, user } = this.props;
    const { error } = this.state;

    return (
      <div className="auth-container">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        {isAuthenticated ? this.renderProfileButton() : this.renderLoginButton()}

        <ProfileModal
          isOpen={isProfileOpen}
          user={user}
          preferences={this.props.userPreferences}
          onClose={onToggleProfile}
          onSignOut={this.handleSignOut}
          onSave={onSavePreferences}
        />
      </div>
    );
  }
}

export default AuthComponent;