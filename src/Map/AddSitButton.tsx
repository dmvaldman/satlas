import React from 'react';
import { Coordinates } from '../types';
import { User } from '../types';
import { Sit } from '../types';

interface AddSitButtonProps {
  isAuthenticated: boolean;
  user: User | null;
  onSignIn: () => Promise<void>;
  currentLocation: Coordinates | null;
  findNearbySit: (coordinates: Coordinates) => Promise<Sit | null>;
  onNearbySitFound: (sit: Sit) => void;
  onPhotoUploadOpen: () => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

interface AddSitButtonState {}

class AddSitButton extends React.Component<AddSitButtonProps, AddSitButtonState> {
  constructor(props: AddSitButtonProps) {
    super(props);
  }

  private handleClick = async () => {
    console.log('AddSitButton clicked');
    const { isAuthenticated, onSignIn, currentLocation, findNearbySit, onNearbySitFound, onPhotoUploadOpen } = this.props;

    if (!isAuthenticated) {
      console.log('Not authenticated, triggering sign in');
      await onSignIn();
      return;
    }

    if (!currentLocation) {
      this.props.showNotification('Location not available', 'error');
      return;
    }

    try {
      const nearbySit = await findNearbySit(currentLocation);
      console.log('Nearby sit check result:', nearbySit);

      if (nearbySit) {
        onNearbySitFound(nearbySit);
        return;
      }

      console.log('Opening photo upload modal');
      onPhotoUploadOpen();
    } catch (error) {
      console.error('Error in handleClick:', error);
      this.props.showNotification('Error checking location', 'error');
    }
  };

  render() {
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
      </>
    );
  }
}

export default AddSitButton;