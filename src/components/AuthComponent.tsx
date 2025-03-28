import React from 'react';
import { User } from 'firebase/auth';
import { UserPreferences } from '../types';
import { Capacitor } from '@capacitor/core';

interface AuthProps {
  user: User | null;
  isAuthenticated: boolean;
  userPreferences: UserPreferences;
  onSignIn: () => Promise<void>;
  onToggleProfile: () => void;
  onSavePreferences: (prefs: UserPreferences) => Promise<void>;
  onUpdatePreferences: (prefs: UserPreferences) => void;
}

interface AuthState {
  isSigningIn: boolean;
}

class AuthComponent extends React.Component<AuthProps, AuthState> {
  private defaultProfileImage = './assets/imgs/profile_blank.jpg';

  constructor(props: AuthProps) {
    super(props);
    this.state = {
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

  private renderLoginButton() {
    const { isSigningIn } = this.state;
    const isIOS = Capacitor.getPlatform() === 'ios';

    return (
      <div className="auth-buttons">
        <button
          className={`auth-button ${isIOS ? 'apple' : 'google'}`}
          onClick={this.handleSignIn}
          disabled={isSigningIn}
        >
          {isSigningIn ? (
            <div className="spinner small"></div>
          ) : (
            <>
              {isIOS ? (
                <svg viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.41-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.05 2.31-.75 3.57-.84 1.51-.12 3.56.86 4.19 2.33-3.42 1.87-2.89 5.98.48 7.13-.65 1.48-1.46 2.83-2.32 4.15zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
              )}
              {isSigningIn ? 'Signing In...' : 'Sign in'}
            </>
          )}
        </button>
      </div>
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
      this.state.isSigningIn !== nextState.isSigningIn ||
      this.state.isSigningInWithApple !== nextState.isSigningInWithApple
    );
  }

  render() {
    const { isAuthenticated } = this.props;

    return (
      <div className="auth-container">
        {isAuthenticated ? this.renderProfileButton() : this.renderLoginButton()}
      </div>
    );
  }
}

export default AuthComponent;