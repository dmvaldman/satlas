import React from 'react';

interface CarouselProps {
  images: Array<{
    id: string;
    photoURL: string;
    userId: string;
  }>;
  currentUserId: string | null;
  onImageAction?: (action: 'replace' | 'delete', imageId: string) => void;
  isDeleting?: boolean;
}

interface CarouselState {
  activeIndex: number;
  showControls: boolean;
}

class Carousel extends React.Component<CarouselProps, CarouselState> {
  constructor(props: CarouselProps) {
    super(props);
    this.state = {
      activeIndex: 0,
      showControls: false
    };
  }

  private handleImageInteraction = () => {
    // For mobile, toggle controls on tap
    if ('ontouchstart' in window) {
      this.setState(prev => ({ showControls: !prev.showControls }));
    }
  };

  next = () => {
    this.setState(prev => ({
      activeIndex: (prev.activeIndex + 1) % this.props.images.length
    }));
  };

  prev = () => {
    this.setState(prev => ({
      activeIndex: prev.activeIndex === 0
        ? this.props.images.length - 1
        : prev.activeIndex - 1
    }));
  };

  render() {
    const { images, currentUserId, onImageAction, isDeleting } = this.props;
    const { activeIndex, showControls: showControlsState } = this.state;

    if (images.length === 0) {
      return <div className="no-images">No images available</div>;
    }

    const currentImage = images[activeIndex];
    const canShowControls = currentUserId && currentImage.userId === currentUserId;

    return (
      <div className="carousel">
        <div className="carousel-content">
          <div
            className="carousel-img-container"
            onMouseEnter={() => this.setState({ showControls: true })}
            onMouseLeave={() => this.setState({ showControls: false })}
            onClick={this.handleImageInteraction}
          >
            <img
              src={currentImage.photoURL}
              alt={`Image ${activeIndex + 1}`}
              className="carousel-image"
            />
            {canShowControls && onImageAction && (showControlsState || !('ontouchstart' in window)) && (
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
          <div className="carousel-dots">
            {images.map((_, index) => (
              <button
                key={index}
                className={`carousel-dot${index === activeIndex ? ' active' : ''}`}
                onClick={() => this.setState({ activeIndex: index })}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
}

export default Carousel;