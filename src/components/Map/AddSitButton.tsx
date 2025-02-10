import { useAuth } from '../../contexts/AuthContext';
import { usePhotoUpload } from '../../contexts/PhotoUploadContext';

export const AddSitButton = () => {
  const { isAuthenticated } = useAuth();
  const { openModal } = usePhotoUpload();

  if (!isAuthenticated) return null;

  return (
    <button
      id="add-satlas-btn"
      className="fab"
      onClick={openModal}
    >
      <svg viewBox="0 0 24 24">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    </button>
  );
};