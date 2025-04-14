import React from 'react';
import { User } from 'firebase/auth';
import { UserPreferences } from '../types';
import { Capacitor } from '@capacitor/core';

interface AuthProps {
  user: User | null;
  isAuthenticated: boolean;
  userPreferences: UserPreferences;
  onSignIn: (message?: string) => Promise<void>;
  onToggleProfile: () => void;
  onSavePreferences: (prefs: UserPreferences) => Promise<void>;
  onUpdatePreferences: (prefs: UserPreferences, usernameChanged?: boolean) => void;
}

class AuthComponent extends React.Component<AuthProps> {
  private defaultProfileImage = './assets/imgs/profile_blank.png';

  constructor(props: AuthProps) {
    super(props);
  }

  private handleSignIn = async () => {
    try {
      await this.props.onSignIn();
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  private renderLoginButton() {
    const isIOS = Capacitor.getPlatform() === 'ios';

    return (
      <div className="auth-buttons">
        <button
          className={`auth-button ${isIOS ? 'apple' : 'google'}`}
          onClick={this.handleSignIn}
        >
        <>
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
          Sign in
        </>
        </button>
      </div>
    );
  }

  private renderProfileButton() {
    const { user, onToggleProfile } = this.props;
    if (!user) return null;

    const hasPhoto = !!user.photoURL;
    const containerClass = hasPhoto ? '' : ' no-image';

    return (
      <div
        id="profile-container"
        className={containerClass}
        onClick={onToggleProfile}
      >
        {hasPhoto ? (
          <img
            id="profile-image"
            src={user.photoURL || undefined}
            alt="Profile"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
        ) : (
          <svg
            className="profile-placeholder-icon"
            viewBox="0 0 24 24"
            style={{ filter: 'url(#svg-shadow)' }}
          >
            <defs>
              <filter id="svg-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow
                  dx="0"
                  dy="2"
                  stdDeviation="1.5"
                  floodColor="#000000"
                  floodOpacity="0.3"
                />
              </filter>
            </defs>

            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </div>
    );
  }

  shouldComponentUpdate(nextProps: AuthProps) {
    // Only update if these props/state have changed
    return (
      this.props.user !== nextProps.user ||
      this.props.isAuthenticated !== nextProps.isAuthenticated
    );
  }

  render() {
    const { isAuthenticated } = this.props;

    return (
      <div className="auth-container">
        {isAuthenticated ? (
          this.renderProfileButton()
        ) : (
          this.renderLoginButton()
        )}
      </div>
    );
  }
}

export default AuthComponent;