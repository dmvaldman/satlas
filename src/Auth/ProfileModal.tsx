import React from 'react';
import { User } from 'firebase/auth';

interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onSave: (preferences: UserPreferences) => Promise<void>;
}

interface ProfileModalState {
  nickname: string;
  pushNotifications: boolean;
  isSubmitting: boolean;
  error: string | null;
}

class ProfileModal extends React.Component<ProfileModalProps, ProfileModalState> {
  constructor(props: ProfileModalProps) {
    super(props);
    this.state = {
      nickname: props.user?.displayName || '',
      pushNotifications: false,
      isSubmitting: false,
      error: null
    };
  }

  private handleSave = async () => {
    const { onSave, onClose } = this.props;
    const { nickname, pushNotifications } = this.state;

    this.setState({ isSubmitting: true, error: null });

    try {
      await onSave({
        nickname,
        pushNotificationsEnabled: pushNotifications,
        lastVisit: Date.now()
      });
      onClose();
    } catch (error) {
      this.setState({
        error: 'Failed to save preferences. Please try again.'
      });
    } finally {
      this.setState({ isSubmitting: false });
    }
  };

  render() {
    const { isOpen, onClose, onSignOut } = this.props;
    const { nickname, pushNotifications, isSubmitting, error } = this.state;

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
            <label htmlFor="nickname">Nickname</label>
            <input
              type="text"
              id="nickname"
              value={nickname}
              onChange={(e) => this.setState({ nickname: e.target.value })}
              placeholder="Enter nickname"
            />
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

          <div className="profile-section">
            <button
              className="profile-button"
              onClick={() => {/* TODO: Implement favorites view */}}
            >
              View Favorite Sits
            </button>
          </div>

          <div className="profile-actions">
            <button
              className="profile-button primary"
              onClick={this.handleSave}
              disabled={isSubmitting}
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