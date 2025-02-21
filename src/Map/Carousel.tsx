import React from 'react';

interface CarouselProps {
  images: Array<{
    id: string;
    photoURL: string;
  }>;
  showControls?: boolean;
  onImageAction?: (action: 'replace' | 'delete', imageId: string) => void;
  isDeleting?: boolean;
}

interface CarouselState {
  activeIndex: number;
}

class Carousel extends React.Component<CarouselProps, CarouselState> {
  constructor(props: CarouselProps) {
    super(props);
    this.state = {
      activeIndex: 0
    };
  }

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
    const { images, showControls, onImageAction, isDeleting } = this.props;
    const { activeIndex } = this.state;

    if (images.length === 0) {
      return <div className="no-images">No images available</div>;
    }

    const currentImage = images[activeIndex];

    return (
      <div className="carousel">
        <div className="carousel-content">
          <img
            src={currentImage.photoURL}
            alt={`Image ${activeIndex + 1}`}
            className="carousel-image"
          />

          {images.length > 1 && (
            <>
              <button
                className="carousel-nav prev"
                onClick={this.prev}
                aria-label="Previous image"
              >
                ←
              </button>
              <button
                className="carousel-nav next"
                onClick={this.next}
                aria-label="Next image"
              >
                →
              </button>
            </>
          )}

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

          {showControls && onImageAction && (
            <div className="image-controls">
              <button
                onClick={() => onImageAction('replace', currentImage.id)}
                disabled={isDeleting}
                className="image-control-button"
              >
                Replace
              </button>
              <button
                onClick={() => onImageAction('delete', currentImage.id)}
                disabled={isDeleting}
                className="image-control-button danger"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default Carousel;