import { usePhotoUpload } from '../../contexts/PhotoUploadContext';
import { useAuth } from '../../contexts/AuthContext';
import { useMap } from '../../contexts/MapContext';
import { useSits } from '../../contexts/SitsContext';

export const AddSitButton = () => {
  const { openModal } = usePhotoUpload();
  const { isAuthenticated, user, signIn } = useAuth();
  const { getCurrentLocation } = useMap();
  const { findNearbySit } = useSits();

  const showNotification = (message: string, type: 'success' | 'error') => {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };

  const handleClick = async () => {
    if (!isAuthenticated) {
      signIn();
      return;
    }

    try {
      // Check location before opening modal
      const coordinates = await getCurrentLocation();
      const nearbySit = await findNearbySit(coordinates);

      if (nearbySit) {
        if (nearbySit.uploadedBy === user?.uid) {
          showNotification("You've already added a sit here", 'error');
        } else {
          showNotification('There is already a sit nearby', 'error');
        }
        return;
      }

      // If we get here, location is valid
      openModal();
    } catch (error) {
      console.error('Error checking location:', error);
      showNotification('Error checking location', 'error');
    }
  };

  return (
    <button
      className="fab"
      id="add-satlas-btn"
      aria-label="Add new Satlas"
      onClick={handleClick}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    </button>
  );
};