import React from 'react';
import { Coordinates } from '../types';
import { User } from '../types';

interface AddSitButtonProps {
  isAuthenticated: boolean;
  user: User | null;
  onSignIn: () => Promise<void>;
  currentLocation: Coordinates | null;
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
    console.log('AddSitButton clicked');
    const { isAuthenticated, onSignIn, currentLocation, findNearbySit, user, onPhotoUploadOpen } = this.props;

    if (!isAuthenticated) {
      console.log('Not authenticated, triggering sign in');
      await onSignIn();
      return;
    }

    if (!currentLocation) {
      this.showNotification('Location not available', 'error');
      return;
    }

    try {
      const nearbySit = await findNearbySit(currentLocation);
      console.log('Nearby sit check result:', nearbySit);

      if (nearbySit) {
        if (nearbySit.uploadedBy === user?.uid) {
          this.showNotification("You've already added a sit here", 'error');
        } else {
          this.showNotification('There is already a sit nearby', 'error');
        }
        return;
      }

      console.log('Opening photo upload modal');
      onPhotoUploadOpen();
    } catch (error) {
      console.error('Error in handleClick:', error);
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