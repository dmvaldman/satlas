import React from 'react';
import { Capacitor } from '@capacitor/core';

interface AppStoreButtonsProps {}

interface AppStoreButtonsState {
  isDismissed: boolean;
  isFadingOut: boolean;
}

class AppStoreButtons extends React.Component<AppStoreButtonsProps, AppStoreButtonsState> {
  private autoDismissTimeout: NodeJS.Timeout | null = null;
  private fadeOutTimeout: NodeJS.Timeout | null = null;

  constructor(props: AppStoreButtonsProps) {
    super(props);
    this.state = {
      isDismissed: false,
      isFadingOut: false
    };
  }

  componentDidMount() {
    // Auto-dismiss after 6 seconds
    this.autoDismissTimeout = setTimeout(() => {
      this.startFadeOut();
    }, 6000);
  }

  componentWillUnmount() {
    // Clean up timeouts
    if (this.autoDismissTimeout) {
      clearTimeout(this.autoDismissTimeout);
    }
    if (this.fadeOutTimeout) {
      clearTimeout(this.fadeOutTimeout);
    }
  }

  private startFadeOut = () => {
    this.setState({ isFadingOut: true });
    // Remove from DOM after animation completes (0.3s)
    this.fadeOutTimeout = setTimeout(() => {
      this.setState({ isDismissed: true });
    }, 300);
  };

  private handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Clear auto-dismiss timeout if user manually dismisses
    if (this.autoDismissTimeout) {
      clearTimeout(this.autoDismissTimeout);
    }
    this.startFadeOut();
  };

  render() {
    // Only show on web (not native platforms)
    if (Capacitor.isNativePlatform()) {
      return null;
    }

    // Don't render if dismissed
    if (this.state.isDismissed) {
      return null;
    }

    return (
      <div className={`app-store-buttons ${this.state.isFadingOut ? 'fading-out' : ''}`}>
        <button
          className="app-store-dismiss-button"
          onClick={this.handleDismiss}
          aria-label="Dismiss app store buttons"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
          </svg>
        </button>
        <a
          href="https://apps.apple.com/us/app/satlas/id6744280675"
          target="_blank"
          rel="noopener noreferrer"
          className="app-store-button ios-button"
        >
          <img src="/iOS_download.png" alt="Download on the App Store" />
        </a>
        <a
          href="https://play.google.com/store/apps/details?id=com.dmvaldman.Satlas"
          target="_blank"
          rel="noopener noreferrer"
          className="app-store-button android-button"
        >
          <img src="/android_download.png" alt="Get it on Google Play" />
        </a>
      </div>
    );
  }
}

export default AppStoreButtons;

