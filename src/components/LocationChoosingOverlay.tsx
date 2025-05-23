import React from 'react';
import BaseModal from './BaseModal';

interface LocationChoosingOverlayProps {
  isVisible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

class LocationChoosingOverlay extends React.Component<LocationChoosingOverlayProps> {
  render() {
    const { isVisible, onConfirm, onCancel } = this.props;

    return (
      <>
        {/* Crosshair - only show when modal is visible */}
        {isVisible && <div className="location-chooser-crosshair"></div>}

        {/* Modal for location choosing */}
        <BaseModal
          isOpen={isVisible}
          onClose={onCancel}
          closeOnOverlayClick={false}
        >
          <h2>Choose Location</h2>
          <p>Position the crosshair at the desired location</p>

            <button
              className="modal-option-button"
              onClick={onConfirm}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
              </svg>
            Confirm Location
          </button>
        </BaseModal>
      </>
    );
  }
}

export default LocationChoosingOverlay;