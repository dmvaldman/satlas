import React from 'react';
import { Image } from '../types';

interface FullScreenCarouselProps {
  images: Image[];
  initialIndex: number;
  onClose: () => void;
}

interface FullScreenCarouselState {
  activeIndex: number;
}

class FullScreenCarousel extends React.Component<FullScreenCarouselProps, FullScreenCarouselState> {
  constructor(props: FullScreenCarouselProps) {
    super(props);
    this.state = {
      activeIndex: props.initialIndex || 0
    };
  }

  private handleNext = () => {
    this.setState(prev => ({
      activeIndex: (prev.activeIndex + 1) % this.props.images.length
    }));
  };

  private handlePrev = () => {
    this.setState(prev => ({
      activeIndex: prev.activeIndex === 0
        ? this.props.images.length - 1
        : prev.activeIndex - 1
    }));
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.props.onClose();
    } else if (e.key === 'ArrowRight') {
      this.handleNext();
    } else if (e.key === 'ArrowLeft') {
      this.handlePrev();
    }
  };

  componentDidMount() {
    // Add keyboard event listeners
    document.addEventListener('keydown', this.handleKeyDown);
    // Prevent scrolling of the background
    document.body.style.overflow = 'hidden';
  }

  componentWillUnmount() {
    // Remove keyboard event listeners
    document.removeEventListener('keydown', this.handleKeyDown);
    // Restore scrolling
    document.body.style.overflow = '';
  }

  render() {
    const { images, onClose } = this.props;
    const { activeIndex } = this.state;
    const currentImage = images[activeIndex];
    const hasMultipleImages = images.length > 1;

    return (
      <div className="fullscreen-carousel-overlay" onClick={onClose}>
        <div className="fullscreen-carousel" onClick={e => e.stopPropagation()}>
          <button className="fullscreen-close-button" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>

          <div className="fullscreen-image-container">
            <img
              src={`${currentImage.photoURL}?size=large`}
              alt={`Image ${activeIndex + 1}`}
              className="fullscreen-image"
            />

            <div className="image-info">
              <span className="image-uploader">Uploaded by: {currentImage.userName}</span>
            </div>
          </div>

          {images.length > 1 && (
            <>
              <button
                className="fullscreen-nav prev"
                onClick={this.handlePrev}
                aria-label="Previous image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                </svg>
              </button>
              <button
                className="fullscreen-nav next"
                onClick={this.handleNext}
                aria-label="Next image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
              </button>
            </>
          )}

          {hasMultipleImages && (
            <div className="fullscreen-carousel-dots">
              {images.map((_, index) => (
                <button
                  key={index}
                  className={`fullscreen-carousel-dot${index === activeIndex ? ' active' : ''}`}
                  onClick={() => this.setState({ activeIndex: index })}
                  aria-label={`Go to image ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default FullScreenCarousel;