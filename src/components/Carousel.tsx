import React from 'react';
import { Image } from '../types';

interface CarouselProps {
  images: Image[];
  currentUserId: string | null;
  isDeleting?: boolean;
  onImageAction?: (action: 'replace' | 'delete', imageId: string) => void;
  onImageClick?: (index: number) => void;
}

interface CarouselState {
  activeIndex: number;
  showControls: boolean;
  imageLoaded: boolean;
  imageAspectRatio: number | null;
}

class Carousel extends React.Component<CarouselProps, CarouselState> {
  constructor(props: CarouselProps) {
    super(props);
    this.state = {
      activeIndex: 0,
      showControls: false,
      imageLoaded: false,
      imageAspectRatio: null
    };
  }

  private handleImageInteraction = () => {
    // For mobile, toggle controls on tap
    if ('ontouchstart' in window) {
      this.setState(prev => ({ showControls: !prev.showControls }));
    }
  };

  private handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const aspectRatio = img.naturalWidth / img.naturalHeight;

    this.setState({
      imageLoaded: true,
      imageAspectRatio: aspectRatio
    });
  };

  next = () => {
    this.setState(prev => ({
      activeIndex: (prev.activeIndex + 1) % this.props.images.length,
      imageLoaded: false,
      imageAspectRatio: null
    }));
  };

  prev = () => {
    this.setState(prev => ({
      activeIndex: prev.activeIndex === 0
        ? this.props.images.length - 1
        : prev.activeIndex - 1,
      imageLoaded: false,
      imageAspectRatio: null
    }));
  };

  componentDidUpdate(prevProps: CarouselProps) {
    // If images array changed (e.g., after deletion)
    if (prevProps.images.length !== this.props.images.length) {
      // Check if current activeIndex is still valid
      if (this.state.activeIndex >= this.props.images.length) {
        // Reset to last valid index
        this.setState({
          activeIndex: Math.max(0, this.props.images.length - 1),
          imageLoaded: false,
          imageAspectRatio: null
        });
      }
    }
  }

  render() {
    const { images, currentUserId, onImageAction, isDeleting, onImageClick } = this.props;
    const { activeIndex, showControls: showControlsState, imageAspectRatio, imageLoaded } = this.state;

    if (images.length === 0) {
      return <div className="no-images">No images available</div>;
    }

    // Make sure activeIndex is within bounds
    const safeActiveIndex = Math.min(activeIndex, images.length - 1);
    const currentImage = images[safeActiveIndex];

    // Safety check before accessing properties
    if (!currentImage) {
      return <div className="no-images">Image not available</div>;
    }

    const canShowControls = currentUserId && currentImage.userId === currentUserId;
    const hasMultipleImages = images.length > 1;

    return (
      <div className={`carousel ${hasMultipleImages ? '' : 'single-image'}`}>
        <div className="carousel-content">
          {hasMultipleImages && (
            <>
              <button
                className="carousel-nav prev"
                onClick={this.prev}
                aria-label="Previous image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                </svg>
              </button>
              <button
                className="carousel-nav next"
                onClick={this.next}
                aria-label="Next image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
              </button>
            </>
          )}
          <div
            className="carousel-img-container"
            onMouseEnter={() => this.setState({ showControls: true })}
            onMouseLeave={() => this.setState({ showControls: false })}
            onClick={this.handleImageInteraction}
          >
            {!imageLoaded && (
              <div className="loading-indicator">
                <div className="spinner"></div>
              </div>
            )}
            <img
              src={currentImage.base64Data ?
                `data:image/jpeg;base64,${currentImage.base64Data.replace(/^data:image\/\w+;base64,/, '')}` :
                `${currentImage.photoURL}?size=med`
              }
              alt={`Photo by ${currentImage.userName}`}
              className={`carousel-image ${imageAspectRatio && imageAspectRatio > 1 ? 'landscape' : 'portrait'}`}
              onClick={() => onImageClick && onImageClick(activeIndex)}
              style={{
                cursor: 'pointer',
                opacity: imageLoaded ? 1 : 0
              }}
              onLoad={this.handleImageLoad}
              onError={(e) => {
                console.error(`Error loading image: ${currentImage.photoURL}`);
              }}
            />
            <div className="image-uploader">
              {currentImage.userName}
            </div>
            {canShowControls && onImageAction && (showControlsState || ('ontouchstart' in window)) && (
              <div className="image-controls">
                <button
                  className="image-control-button"
                  onClick={() => onImageAction('replace', currentImage.id)}
                  disabled={isDeleting}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                </button>
                <button
                  className="image-control-button delete"
                  onClick={() => onImageAction('delete', currentImage.id)}
                  disabled={isDeleting}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
          {/* Only show dots if there are multiple images */}
          {hasMultipleImages && (
            <div className="carousel-dots">
              {images.map((_, index) => (
                <button
                  key={index}
                  className={`carousel-dot${index === safeActiveIndex ? ' active' : ''}`}
                  onClick={() => this.setState({
                    activeIndex: index,
                    imageLoaded: false,
                    imageAspectRatio: null
                  })}
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

export default Carousel;