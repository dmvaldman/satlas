import { Carousel } from '../Carousel/Carousel';
import { useMarks } from '../../contexts/MarksContext';
import { Sit, Image, MarkType } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useSits } from '../../contexts/SitsContext';
import { usePhotoUpload } from '../../contexts/PhotoUploadContext';
import { FavoriteCount } from './FavoriteCount';
import { useEffect, useState } from 'react';

interface PopupContentProps {
  sit: Sit;
  images: Image[]; // initial images passed when popup is created
  currentLocation: { latitude: number; longitude: number };
}

export const PopupContent: React.FC<PopupContentProps> = ({ sit, images: initialImages, currentLocation }) => {
  const { hasMark, toggleMark } = useMarks();
  const { deleteImage, getImagesForSit, imagesByCollection } = useSits();
  const { openModal } = usePhotoUpload();
  const { user } = useAuth();
  const [images, setImages] = useState<Image[]>(initialImages);

  // Re-fetch images whenever the cached images change
  useEffect(() => {
    getImagesForSit(sit.imageCollectionId).then(setImages);
  }, [getImagesForSit, imagesByCollection, sit.imageCollectionId]);

  // Add effect to refresh on mark updates
  useEffect(() => {
    const handleMarkUpdate = (e: CustomEvent<{ sitId: string }>) => {
      if (e.detail.sitId === sit.id) {
        // Force re-render to update favorite count
        setImages([...images]);
      }
    };

    window.addEventListener('markUpdated', handleMarkUpdate as EventListener);
    return () => {
      window.removeEventListener('markUpdated', handleMarkUpdate as EventListener);
    };
  }, [sit.id, images]);

  const handleMarkClick = async (e: React.MouseEvent, type: MarkType) => {
    e.stopPropagation();
    try {
      await toggleMark(sit.id, type);
    } catch (error) {
      console.error('Error in handleMarkClick:', error);
    }
  };

  const handleImageAction = async (action: 'replace' | 'delete', imageId: string) => {
    if (!user) return;
    try {
      if (action === 'delete') {
        if (window.confirm('Are you sure you want to delete this photo?')) {
          // Run deleteImage which will update the cached images immediately
          await deleteImage(sit.id, imageId);
        }
      } else if (action === 'replace') {
        window.dispatchEvent(new CustomEvent('openPhotoUploadModal', {
          detail: { sitId: sit.id, imageId }
        }));
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
        <div className="mark-buttons">
          {(['favorite', 'visited', 'wantToGo'] as MarkType[]).map(type => (
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
            </button>
          ))}
        </div>
        <FavoriteCount sitId={sit.id} />
      </div>
    </div>
  );
};