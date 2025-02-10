import { usePhotoUpload } from '../../contexts/PhotoUploadContext';

export const PhotoUploadModal = () => {
  const { isModalOpen, closeModal, takePhoto, choosePhoto, isUploading } = usePhotoUpload();

  if (!isModalOpen) return null;

  return (
    <div
      className={`modal-overlay ${isModalOpen ? 'active' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="photo-options">
        <button
          className="photo-option-button"
          onClick={takePhoto}
          disabled={isUploading}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 15.2C13.7673 15.2 15.2 13.7673 15.2 12C15.2 10.2327 13.7673 8.8 12 8.8C10.2327 8.8 8.8 10.2327 8.8 12C8.8 13.7673 10.2327 15.2 12 15.2Z"/>
            <path d="M9 2L7.17 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4H16.83L15 2H9ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17Z"/>
          </svg>
          Take Photo
        </button>
        <button
          className="photo-option-button"
          onClick={choosePhoto}
          disabled={isUploading}
        >
          <svg viewBox="0 0 24 24">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          Choose from Gallery
        </button>
        <button
          className="photo-option-button cancel-button"
          onClick={closeModal}
          disabled={isUploading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};