import React from 'react';
import { Sit } from '../types';

interface NearbyExistingSitModalProps {
  isOpen: boolean;
  sit: Sit | null;
  onClose: () => void;
  onUploadToExisting: (sit: Sit) => void;
}

export default function NearbyExistingSitModal({
  isOpen,
  sit,
  onClose,
  onUploadToExisting
}: NearbyExistingSitModalProps) {
  if (!isOpen || !sit) return null;

  return (
    <div className={`modal-overlay${isOpen ? ' active' : ''}`} onClick={onClose}>
      <div className="photo-options" onClick={(e) => e.stopPropagation()}>
        <h2>Existing Satlas Nearby</h2>
        <p>You are close to an existing satlas. Would you like to upload a photo to it?</p>

        <button
          className="photo-option-button"
          onClick={() => onUploadToExisting(sit)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          Upload Photo
        </button>

        <button
          className="photo-option-button cancel-button"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}