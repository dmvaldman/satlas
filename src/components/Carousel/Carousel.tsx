import { useEffect } from 'react';
import { useCarousel } from '../../hooks/useCarousel';
import { Image } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

interface CarouselProps {
  images: Image[];
  sitId: string;
  onImageAction?: (action: 'replace' | 'delete', imageId: string) => void;
}

export const Carousel = ({ images, sitId, onImageAction }: CarouselProps) => {
  const { activeIndex, next, prev, hasMultipleSlides } = useCarousel(images.length);
  const { user } = useAuth();

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        prev();
      } else if (e.key === 'ArrowRight') {
        next();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [next, prev]);

  return (
    <div className="image-carousel">
      <button
        className="carousel-prev"
        onClick={prev}
        disabled={!hasMultipleSlides}
      >
        ←
      </button>
      <div className="carousel-container">
        {images.map((image, index) => (
          <div
            key={image.id}
            className={`carousel-slide ${index === activeIndex ? 'active' : ''}`}
          >
            <img src={image.photoURL} alt="Sit view" />
            {image.userId === user?.uid && (
              <div className="image-controls">
                <button
                  className="replace-photo"
                  onClick={() => onImageAction?.('replace', image.id)}
                  data-sit-id={sitId}
                  data-image-id={image.id}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                </button>
                <button
                  className="delete-photo"
                  onClick={() => onImageAction?.('delete', image.id)}
                  data-sit-id={sitId}
                  data-image-id={image.id}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            )}
            <p className="author">Posted by: {image.userName}</p>
          </div>
        ))}
      </div>
      <button
        className="carousel-next"
        onClick={next}
        disabled={!hasMultipleSlides}
      >
        →
      </button>
    </div>
  );
};