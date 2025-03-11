import React from 'react';
import { Image } from '../types';

interface CarouselProps {
  images: Image[];
  currentUserId: string | null;
  isDeleting?: boolean;
  onImageAction?: (action: 'replace' | 'delete', imageId: string) => void;
}

interface CarouselState {
  activeIndex: number;
  showControls: boolean;
  translateX: number;
  startX: number | null;
  isDragging: boolean;
  containerWidth: number;
  totalWidth: number;
  loadedImages: Set<number>;
}

class Carousel extends React.Component<CarouselProps, CarouselState> {
  private carouselRef = React.createRef<HTMLDivElement>();
  private containerRef = React.createRef<HTMLDivElement>();
  private imageRefs: React.RefObject<HTMLImageElement>[] = [];
  private resizeObserver: ResizeObserver | null = null;

  constructor(props: CarouselProps) {
    super(props);

    // Initialize image refs
    this.props.images.forEach(() => {
      this.imageRefs.push(React.createRef<HTMLImageElement>());
    });

    this.state = {
      activeIndex: 0,
      showControls: false,
      translateX: 0,
      startX: null,
      isDragging: false,
      containerWidth: 0,
      totalWidth: 0,
      loadedImages: new Set<number>()
    };
  }

  componentDidMount() {
    // Add event listeners for touch and mouse events
    if (this.containerRef.current) {
      this.containerRef.current.addEventListener('touchstart', this.handleDragStart, { passive: false });
      this.containerRef.current.addEventListener('touchmove', this.handleDragMove, { passive: false });
      this.containerRef.current.addEventListener('touchend', this.handleDragEnd);
      this.containerRef.current.addEventListener('mousedown', this.handleDragStart);
      window.addEventListener('mousemove', this.handleDragMove);
      window.addEventListener('mouseup', this.handleDragEnd);
    }

    // Set up resize observer to handle container size changes
    this.resizeObserver = new ResizeObserver(this.handleResize);
    if (this.containerRef.current) {
      this.resizeObserver.observe(this.containerRef.current);
    }

    // Initial calculation of container width
    this.calculateDimensions();

    // Preload the first few images
    this.updateVisibleImages(this.state.translateX);
  }

  componentWillUnmount() {
    // Clean up event listeners
    if (this.containerRef.current) {
      this.containerRef.current.removeEventListener('touchstart', this.handleDragStart);
      this.containerRef.current.removeEventListener('touchmove', this.handleDragMove);
      this.containerRef.current.removeEventListener('touchend', this.handleDragEnd);
      this.containerRef.current.removeEventListener('mousedown', this.handleDragStart);
      window.removeEventListener('mousemove', this.handleDragMove);
      window.removeEventListener('mouseup', this.handleDragEnd);
    }

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  componentDidUpdate(prevProps: CarouselProps) {
    // If images array changed (e.g., after deletion)
    if (prevProps.images.length !== this.props.images.length) {
      // Reset image refs
      this.imageRefs = [];
      this.props.images.forEach(() => {
        this.imageRefs.push(React.createRef<HTMLImageElement>());
      });

      // Check if current activeIndex is still valid
      if (this.state.activeIndex >= this.props.images.length) {
        // Reset to last valid index
        this.setState({
          activeIndex: Math.max(0, this.props.images.length - 1),
          translateX: 0,
          loadedImages: new Set<number>([0])
        });
      } else {
        // Recalculate dimensions
        this.calculateDimensions();
      }
    }
  }

  private calculateDimensions = () => {
    if (!this.containerRef.current) return;

    const containerWidth = this.containerRef.current.clientWidth;

    // For single images, set totalWidth equal to containerWidth to prevent dragging
    if (this.props.images.length <= 1) {
      this.setState({
        containerWidth,
        totalWidth: containerWidth,
        translateX: 0 // Reset position for single image
      });
      return;
    }

    let totalWidth = 0;

    // Calculate total width of all images with padding
    this.imageRefs.forEach((ref, index) => {
      if (ref.current) {
        const imageWidth = ref.current.clientWidth;
        totalWidth += imageWidth + (index < this.props.images.length - 1 ? 16 : 0); // 16px padding between images
      }
    });

    // If total width is less than container width, no dragging should be possible
    if (totalWidth <= containerWidth) {
      totalWidth = containerWidth;
    }

    this.setState({ containerWidth, totalWidth });
  };

  private handleResize = () => {
    this.calculateDimensions();

    // Reset position when resizing
    this.setState({ translateX: 0 });
  };

  private handleDragStart = (e: MouseEvent | TouchEvent) => {
    // Explicitly prevent dragging for single images
    if (this.props.images.length <= 1) {
      return;
    }

    // Don't prevent default for touchstart to allow scrolling if needed
    if (!('touches' in e)) {
      e.preventDefault();
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

    this.setState({
      startX: clientX,
      isDragging: true
    });
  };

  private handleDragMove = (e: MouseEvent | TouchEvent) => {
    // Explicitly prevent dragging for single images
    if (this.props.images.length <= 1) {
      return;
    }

    if (!this.state.isDragging || this.state.startX === null) return;

    // Always prevent default during drag to prevent page scrolling
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - this.state.startX;

    // Calculate new translateX with boundaries
    let newTranslateX = this.state.translateX + deltaX;

    if (newTranslateX > 0) {
      newTranslateX = 0;
    }

    // Don't allow dragging past the end
    const maxTranslateX = -(this.state.totalWidth - this.state.containerWidth);
    if (newTranslateX < maxTranslateX && maxTranslateX < 0) {
      newTranslateX = maxTranslateX;
    }

    this.setState({
      translateX: newTranslateX,
      startX: clientX
    });

    // Determine which images should be loaded based on visibility
    this.updateVisibleImages(newTranslateX);
  };

  private updateVisibleImages = (translateX: number) => {
    if (!this.containerRef.current) return;

    const containerWidth = this.containerRef.current.clientWidth;
    const visibleStart = -translateX;
    const visibleEnd = visibleStart + containerWidth;

    // Buffer zone - load images that are just outside the visible area
    const buffer = containerWidth * 1.5; // Increased buffer for smoother experience

    let currentPosition = 0;
    const newLoadedImages = new Set(this.state.loadedImages);

    this.imageRefs.forEach((ref, index) => {
      const image = this.props.images[index];

      if (ref.current) {
        const imageWidth = ref.current.clientWidth;
        const imageEnd = currentPosition + imageWidth;

        // If image is visible or within buffer zone, mark it for loading
        if ((currentPosition >= visibleStart - buffer && currentPosition <= visibleEnd + buffer) ||
            (imageEnd >= visibleStart - buffer && imageEnd <= visibleEnd + buffer)) {
          newLoadedImages.add(index);
        }

        currentPosition += imageWidth + 16; // 16px padding between images
      } else {
        // If ref is not available yet, use image dimensions to estimate size if available
        let width;

          // Calculate width based on container height and aspect ratio
        const containerHeight = this.containerRef.current?.clientHeight || 300; // Default to 300px if null
        const aspectRatio = image.width / image.height;

        // If image is wider than tall, it will be constrained by height
        if (aspectRatio > 1) {
          width = containerHeight * aspectRatio;
        } else {
          // If image is taller than wide, it will likely take up most of the container width
          width = containerWidth * 0.8;
        }

        const end = currentPosition + width;

        // If estimated position is visible, mark for loading
        if ((currentPosition >= visibleStart - buffer && currentPosition <= visibleEnd + buffer) ||
            (end >= visibleStart - buffer && end <= visibleEnd + buffer)) {
          newLoadedImages.add(index);
        }

        currentPosition += width + 16; // 16px padding between images
      }
    });

    // Only update state if the loaded images set has changed
    if (newLoadedImages.size !== this.state.loadedImages.size ||
        ![...newLoadedImages].every(index => this.state.loadedImages.has(index))) {
      this.setState({ loadedImages: newLoadedImages });
    }
  };

  private handleDragEnd = () => {
    // Snap back to boundaries with animation
    if (this.state.translateX > 0) {
      this.setState({
        translateX: 0,
        isDragging: false
      });
    } else {
      const maxTranslateX = -(this.state.totalWidth - this.state.containerWidth);
      if (this.state.translateX < maxTranslateX && maxTranslateX < 0) {
        this.setState({
          translateX: maxTranslateX,
          isDragging: false
        });
      } else {
        this.setState({ isDragging: false });
      }
    }
  };

  private handleImageLoad = (index: number) => {
    // Mark this image as loaded
    this.setState(prevState => {
      const newLoadedImages = new Set(prevState.loadedImages);
      newLoadedImages.add(index);
      return { loadedImages: newLoadedImages };
    });
  };

  private handleImageInteraction = () => {
    // For mobile, toggle controls on tap
    if ('ontouchstart' in window) {
      this.setState(prev => ({ showControls: !prev.showControls }));
    }
  };

  render() {
    const { images, currentUserId, onImageAction, isDeleting } = this.props;
    const { showControls: showControlsState, translateX, loadedImages, isDragging } = this.state;

    if (images.length === 0) {
      return <div className="no-images">No images available</div>;
    }

    const isSingleImage = images.length === 1;

    return (
      <div className="carousel" ref={this.carouselRef}>
        <div className="carousel-content" ref={this.containerRef}>
          <div
            className={`carousel-track ${isDragging ? 'dragging' : ''} ${isSingleImage ? 'single-image' : ''}`}
            style={{ transform: `translateX(${translateX}px)` }}
          >
            {images.map((image, index) => {
              const shouldLoad = loadedImages.has(index);
              const canShowControls = currentUserId && image.userId === currentUserId;

              return (
                <div key={image.id} className="carousel-item">
                  <div
                    className="carousel-img-container"
                    onClick={this.handleImageInteraction}
                  >
                    <div className="aspect-ratio-container">
                      {shouldLoad ? (
                        <img
                          ref={this.imageRefs[index]}
                          src={image.base64Data ?
                            `data:image/jpeg;base64,${image.base64Data.replace(/^data:image\/\w+;base64,/, '')}` :
                            `${image.photoURL}?size=med`
                          }
                          alt={`Photo by ${image.userName}`}
                          className="carousel-image"
                          onLoad={() => this.handleImageLoad(index)}
                          onError={(e) => {
                            console.error(`Error loading image: ${image.photoURL}, ${image.id}`);
                          }}
                        />
                      ) : null}

                      {/* Always render the spinner, but hide it when the image is loaded */}
                      <div className={`placeholder-loader ${shouldLoad && loadedImages.has(index) ? 'hidden' : ''}`}>
                        <div className="spinner"></div>
                      </div>

                      <div className="image-uploader">
                        {image.userName}
                      </div>
                    </div>

                    {canShowControls && onImageAction && (showControlsState || ('ontouchstart' in window)) && (
                      <div className="image-controls">
                        <button
                          className="image-control-button"
                          onClick={() => onImageAction('replace', image.id)}
                          disabled={isDeleting}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                          </svg>
                        </button>
                        <button
                          className="image-control-button delete"
                          onClick={() => onImageAction('delete', image.id)}
                          disabled={isDeleting}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
}

export default Carousel;