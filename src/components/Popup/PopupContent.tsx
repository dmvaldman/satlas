import { Carousel } from '../Carousel/Carousel';
import { useMarks } from '../../contexts/MarksContext';
import { Sit, Image, MarkType } from '../../types';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useSits } from '../../contexts/SitsContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePhotoUpload } from '../../contexts/PhotoUploadContext';

interface PopupContentProps {
  sit: Sit;
  images: Image[];
  currentLocation: { latitude: number; longitude: number };
}

export const PopupContent: React.FC<PopupContentProps> = ({ sit, images, currentLocation }) => {
  const { hasMark, getMarkCount, toggleMark } = useMarks();
  const { deleteImage, replaceImage } = useSits();
  const photoUploadContext = usePhotoUpload();

  console.log('PhotoUpload context in PopupContent:', photoUploadContext);

  const { openModal } = photoUploadContext;
  const { user } = useAuth();

  const handleMarkClick = async (e: React.MouseEvent, type: MarkType) => {
    console.log('Mark button clicked:', { type, sitId: sit.id });
    e.stopPropagation();
    try {
      await toggleMark(sit.id, type);
      console.log('Mark toggle completed');
    } catch (error) {
      console.error('Error in handleMarkClick:', error);
    }
  };

  const handleImageAction = async (action: 'replace' | 'delete', imageId: string) => {
    console.log('handleImageAction called:', { action, imageId, user });
    if (!user) return;

    try {
      if (action === 'delete') {
        if (window.confirm('Are you sure you want to delete this photo?')) {
          await deleteImage(sit.id, imageId);
        }
      } else if (action === 'replace') {
        console.log('Attempting to open modal for replacement:', { sitId: sit.id, imageId });
        console.log('Using openModal function:', openModal);
        openModal({ sitId: sit.id, imageId });
      }
    } catch (error) {
      console.error(`Error ${action}ing image:`, error);
    }
  };

  return (
    <div className="satlas-popup">
      <Carousel
        images={images}
        sitId={sit.id}
        onImageAction={handleImageAction}
        showControls={images.some(img => img.userId === user?.uid)}
      />
      <div className="satlas-popup-info">
        {getMarkCount(sit.id, 'favorite') > 0 && (
          <p className="favorite-count-text">
            Favorited {getMarkCount(sit.id, 'favorite')}
            {getMarkCount(sit.id, 'favorite') === 1 ? ' time' : ' times'}
          </p>
        )}
        <div className="mark-buttons">
          {(['favorite', 'visited', 'wantToGo'] as MarkType[]).map(type => {
            return (
              <button
                key={type}
                className={`mark-button ${type}${hasMark(sit.id, type) ? ' active' : ''}`}
                onClick={(e) => handleMarkClick(e, type)}
              >
                {type === 'favorite' && (
                  <svg viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                )}
                {type === 'visited' && (
                  <svg viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                )}
                {type === 'wantToGo' && (
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                  </svg>
                )}
                {getMarkCount(sit.id, type) || ''}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};