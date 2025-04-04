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

    return (
      <div
        id="profile-container"
        onClick={onToggleProfile}
      >
        {user.photoURL ? (
          <img
            id="profile-image"
            src={user.photoURL}
            alt="Profile"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
        ) : (
          <svg className="profile-placeholder-icon" viewBox="0 0 24 24" fill="currentColor">
            {/* Gear Icon Path
            <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12-.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
            */}
            {/* Hamburger Menu Icon Paths - Filled Rectangles (Commented out) */}
            {/* <path d="M3 18.5 H21 V15.5 H3 Z M3 13.5 H21 V10.5 H3 Z M3 8.5 H21 V5.5 H3 Z"></path> */}
            {/* Hamburger Menu using <line> elements (Current) */}
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
            {/* Option: Person Silhouette Icon (Commented out) */}
            {/* <circle cx="12" cy="7" r="4" fill="none" />
            <path d="M5.5 21 V19 c0-2.5 3-4 6.5-4 s 6.5 1.5 6.5 4 v2" fill="none" /> */}
            {/* Option: Sliders/Controls Icon */}
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