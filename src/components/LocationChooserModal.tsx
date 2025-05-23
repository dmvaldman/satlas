import React from 'react';
import BaseModal from './BaseModal';

interface LocationChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChooseLocation: () => void;
}

class LocationChooserModal extends React.Component<LocationChooserModalProps> {
  render() {
    const { isOpen, onClose, onChooseLocation } = this.props;

    return (
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
      >
        <h2>Location Not Found</h2>
        <p>This photo doesn't have location information</p>
        <p>Edit its location manually?</p>

        <button
          className="modal-option-button"
          onClick={onChooseLocation}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          Edit Location
        </button>
      </BaseModal>
    );
  }
}

export default LocationChooserModal;