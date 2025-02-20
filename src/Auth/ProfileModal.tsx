import React from 'react';
import { User } from 'firebase/auth';

interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onSave: (preferences: { nickname: string; pushNotifications: boolean }) => Promise<void>;
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
      await onSave({ nickname, pushNotifications });
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
              onClick={this.handleSave}
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
              onClick={onClose}
              className="cancel-button"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ProfileModal;