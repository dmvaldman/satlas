import React from 'react';
import BaseModal from './BaseModal';

interface NearbyExistingSitModalProps {
  isOpen: boolean;
  sitId: string | null;
  hasUserContributed?: boolean;
  onClose: (sitId: string) => void;
  onUploadToExisting: (sitId: string) => void;
}

class NearbyExistingSitModal extends React.Component<NearbyExistingSitModalProps> {
  render() {
    const { isOpen, sitId, onClose, onUploadToExisting, hasUserContributed } = this.props;

    if (!sitId) return null;

    return (
      <BaseModal
        isOpen={isOpen}
        onClose={() => onClose(sitId)}
        contentClassName="photo-options"
      >
        <h2>Sit Nearby</h2>

        {hasUserContributed ? (
          <>
            <p>You're too close to an existing sit that you've already contributed to.</p>
          </>
        ) : (
          <>
            <p>You are too close to an existing sit</p>
            <p>Add a photo to it?</p>

            <button
              className="modal-option-button"
              onClick={() => onUploadToExisting(sitId)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
              Upload Photo
            </button>
          </>
        )}
      </BaseModal>
    );
  }
}

export default NearbyExistingSitModal;