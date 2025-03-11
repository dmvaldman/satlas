import React from 'react';
import { Sit } from '../types';

interface NearbyExistingSitModalProps {
  isOpen: boolean;
  sit: Sit | null;
  onClose: () => void;
  onUploadToExisting: (sit: Sit) => void;
}

class NearbyExistingSitModal extends React.Component<NearbyExistingSitModalProps> {
  private modalRef = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this.updateModalAnimation();
  }

  componentDidUpdate(prevProps: NearbyExistingSitModalProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      this.updateModalAnimation();
    } else if (prevProps.isOpen && !this.props.isOpen) {
      // Modal is closing
      if (this.modalRef.current) {
        this.modalRef.current.classList.remove('active');
      }
    }
  }

  private updateModalAnimation() {
    if (this.modalRef.current) {
      // Trigger reflow
      void this.modalRef.current.offsetHeight;
      this.modalRef.current.classList.add('active');
    }
  }

  render() {
    const { isOpen, sit, onClose, onUploadToExisting } = this.props;

    if (!isOpen || !sit) return null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div ref={this.modalRef} className="modal-content photo-options" onClick={(e) => e.stopPropagation()}>
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
        </div>
      </div>
    );
  }
}

export default NearbyExistingSitModal;