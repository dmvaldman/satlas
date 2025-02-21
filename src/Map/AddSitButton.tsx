import React from 'react';
import { Coordinates } from '../types';

interface AddSitButtonProps {
  isAuthenticated: boolean;
  userId: string | null;
  onSignIn: () => Promise<void>;
  getCurrentLocation: () => Promise<Coordinates>;
  findNearbySit: (coordinates: Coordinates) => Promise<any>;
  onPhotoUploadOpen: () => void;
}

interface AddSitButtonState {
  notification: {
    message: string;
    type: 'success' | 'error';
  } | null;
}

class AddSitButton extends React.Component<AddSitButtonProps, AddSitButtonState> {
  constructor(props: AddSitButtonProps) {
    super(props);
    this.state = {
      notification: null
    };
  }

  private showNotification(message: string, type: 'success' | 'error') {
    this.setState({
      notification: { message, type }
    }, () => {
      setTimeout(() => {
        this.setState({ notification: null });
      }, 3000);
    });
  }

  private handleClick = async () => {
    const { isAuthenticated, onSignIn, getCurrentLocation, findNearbySit, userId, onPhotoUploadOpen } = this.props;

    if (!isAuthenticated) {
      await onSignIn();
      return;
    }

    try {
      // Check location before opening modal
      const coordinates = await getCurrentLocation();
      const nearbySit = await findNearbySit(coordinates);

      if (nearbySit) {
        if (nearbySit.uploadedBy === userId) {
          this.showNotification("You've already added a sit here", 'error');
        } else {
          this.showNotification('There is already a sit nearby', 'error');
        }
        return;
      }

      // If we get here, location is valid
      onPhotoUploadOpen();
    } catch (error) {
      console.error('Error checking location:', error);
      this.showNotification('Error checking location', 'error');
    }
  };

  render() {
    const { notification } = this.state;

    return (
      <>
        <button
          className="fab"
          id="add-satlas-btn"
          aria-label="Add new Satlas"
          onClick={this.handleClick}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>

        {notification && (
          <div className={`notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
      </>
    );
  }
}

export default AddSitButton;