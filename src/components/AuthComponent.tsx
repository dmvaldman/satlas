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
  onUpdatePreferences: (prefs: UserPreferences) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

interface AuthState {
  error: string | null;
  isSigningIn: boolean;
}

class AuthComponent extends React.Component<AuthProps, AuthState> {
  private defaultProfileImage = './assets/imgs/profile_blank.jpg';

  constructor(props: AuthProps) {
    super(props);
    this.state = {
      error: null,
      isSigningIn: false
    };
  }

  private handleSignIn = async () => {
    console.log('[Auth] Sign-in button clicked');
    this.setState({ isSigningIn: true });

    try {
      console.log('[Auth] Calling onSignIn...');
      await this.props.onSignIn();
      console.log('[Auth] Sign-in successful');
    } catch (error) {
      console.error('[Auth] Error signing in:', error);
      // Check if the error is due to user cancellation
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('cancel') || errorMessage.includes('dismissed') || errorMessage.includes('closed')) {
        console.log('[Auth] Sign-in was cancelled by the user');
      }
    } finally {
      // Always reset the signing in state, regardless of success or failure
      this.setState({ isSigningIn: false });
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
    const { isSigningIn } = this.state;

    return (
      <button
        className={`auth-button`}
        onClick={this.handleSignIn}
        disabled={isSigningIn}
      >
        {isSigningIn ? (
          <div className="spinner small"></div>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
        )}
        {isSigningIn ? 'Signing In...' : 'Sign In'}
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
      this.state.error !== nextState.error ||
      this.state.isSigningIn !== nextState.isSigningIn
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
          onUpdatePreferences={this.props.onUpdatePreferences}
          showNotification={this.props.showNotification}
        />
      </div>
    );
  }
}

export default AuthComponent;