import React from 'react';
import BaseModal from './BaseModal';

interface NearbyExistingSitModalProps {
  isOpen: boolean;
  sitId: string | null;
  hasUserContributed?: boolean;
  imageId?: string;
  onClose: (sitId: string) => void;
  onUploadToExisting: (sitId: string) => void;
  onReplaceImage: (sitId: string, imageId: string) => void;
}

class NearbyExistingSitModal extends React.Component<NearbyExistingSitModalProps> {
  render() {
    const { isOpen, sitId, onClose, onUploadToExisting, hasUserContributed, imageId, onReplaceImage } = this.props;

    if (!sitId) return null;

    return (
      <BaseModal
        isOpen={isOpen}
        onClose={() => onClose(sitId)}
      >
        <h2>Sit Nearby</h2>

        {hasUserContributed? (
          <>
            <p>You're too close to a sit you've already contributed to.</p>
            <p>Replace your photo instead?</p>

            {imageId && (
              <button
                className="modal-option-button"
                onClick={() => onReplaceImage(sitId, imageId)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
                Replace Photo
              </button>
            )}
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