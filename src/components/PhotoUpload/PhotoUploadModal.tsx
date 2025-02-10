import { usePhotoUpload } from '../../contexts/PhotoUploadContext';

export const PhotoUploadModal: React.FC = () => {
  console.log('PhotoUploadModal render');

  const {
    isModalOpen,
    isUploading,
    closeModal,
    takePhoto,
    chooseFromGallery
  } = usePhotoUpload();

  if (!isModalOpen) return null;

  return (
    <div
      className="modal-overlay active"
      onClick={() => console.log('Modal overlay clicked')}
    >
      {console.log('Modal DOM rendered - should see this when modal is open')}
      <div className="photo-options">
        <button
          className="photo-option-button"
          onClick={takePhoto}
          disabled={isUploading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
            <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
          </svg>
          {isUploading ? 'Uploading...' : 'Take Photo'}
        </button>
        <button
          className="photo-option-button"
          onClick={chooseFromGallery}
          disabled={isUploading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          {isUploading ? 'Uploading...' : 'Choose from Gallery'}
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