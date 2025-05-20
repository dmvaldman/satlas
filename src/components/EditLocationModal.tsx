import React from 'react';
import BaseModal from './BaseModal';

interface EditLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const EditLocationModal: React.FC<EditLocationModalProps> = ({ isOpen, onClose, onConfirm }) => {
  // BaseModal already handles the isOpen logic internally, so we don't need to return null if !isOpen.
  // We pass isOpen to BaseModal, and it will render (or not) accordingly.

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose} 
      // Optional: If BaseModal needs a title, provide one, e.g., title="Set Photo Location"
      // For this simple confirmation, a title might be redundant if the message is clear.
    >
      <div className="edit-location-modal-content" style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ marginBottom: '20px', fontSize: '16px' }}>
          Photo location is missing. Would you like to select it manually on the map?
        </p>
        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
          <button 
            className="modal-option-button" // Assuming this class provides appropriate styling
            onClick={onConfirm}
            style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }} // Basic inline styles
          >
            Select Location
          </button>
          <button 
            className="modal-option-button button-secondary" // Assuming this class provides alternative styling
            onClick={onClose}
            style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#ccc' }} // Basic inline styles
          >
            Cancel
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default EditLocationModal;
