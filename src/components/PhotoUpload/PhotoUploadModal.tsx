import { usePhotoUpload } from '../../contexts/PhotoUploadContext';

export const PhotoUploadModal: React.FC = () => {
  const { isModalOpen, closeModal, takePhoto, chooseFromGallery } = usePhotoUpload();

  const handleTakePhoto = async () => {
    const base64Image = await takePhoto();
    if (base64Image) {
      // Handle the photo - we'll need to pass this up to a parent component
      closeModal();
    }
  };

  const handleChoosePhoto = async () => {
    const base64Image = await chooseFromGallery();
    if (base64Image) {
      // Handle the photo - we'll need to pass this up to a parent component
      closeModal();
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="modal-overlay active">
      <div className="photo-options">
        <button className="photo-option-button" onClick={handleTakePhoto}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
            <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
          </svg>
          Take Photo
        </button>
        <button className="photo-option-button" onClick={handleChoosePhoto}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          Choose from Gallery
        </button>
        <button className="photo-option-button cancel-button" onClick={closeModal}>
          Cancel
        </button>
      </div>
    </div>
  );
};