import React from 'react';
import { Image } from '../types';

interface CarouselProps {
  images: Image[];
  currentUserId: string | null;
  isDeleting?: boolean;
  onImageAction?: (action: 'replace' | 'delete', imageId: string) => void;
}

// Define image status types
type ImageStatus = 'notLoaded' | 'loading' | 'loaded';

interface CarouselState {
  activeIndex: number;
  showControls: boolean;
  translateX: number;
  startX: number | null;
  isDragging: boolean;
  containerWidth: number;
  totalWidth: number;
  // A map of image indices to their loading status
  imageStatus: Map<number, ImageStatus>;
}

class Carousel extends React.Component<CarouselProps, CarouselState> {
  private carouselRef = React.createRef<HTMLDivElement>();
  private containerRef = React.createRef<HTMLDivElement>();
  private imageRefs: React.RefObject<HTMLImageElement>[] = [];
  private resizeObserver: ResizeObserver | null = null;

  // This static method ensures that when the component receives new props,
  // it properly resets its state
  static getDerivedStateFromProps(nextProps: CarouselProps, prevState: CarouselState) {
    // If this is a new set of images, reset the state
    if (nextProps.images.length > 0 && prevState.imageStatus.size === 0) {
      console.log('getDerivedStateFromProps: Initializing with new images');

      // Initialize with the first image visible
      const initialImageStatus = new Map<number, ImageStatus>();
      // Mark the first image as loading by default
      initialImageStatus.set(0, 'loading');

      return {
        activeIndex: 0,
        translateX: 0,
        imageStatus: initialImageStatus
      };
    }

    return null; // No state update needed
  }

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
      imageStatus: new Map<number, ImageStatus>()
    };
  }

  componentDidMount() {
    console.log('Carousel mounted with images:', this.props.images.length);

    // Reset state to ensure we always start from the beginning
    this.setState({
      translateX: 0,
      activeIndex: 0,
      imageStatus: new Map<number, ImageStatus>()
    }, () => {
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

      // Initialize visible images
      this.updateVisibleImages(0);
    });
  }

  componentWillUnmount() {
    console.log('Carousel unmounting');

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

  componentDidUpdate(prevProps: CarouselProps, prevState: CarouselState) {
    // If images array changed (e.g., after deletion or when a new sit is loaded)
    if (prevProps.images !== this.props.images) {
      console.log('Images array changed, resetting carousel');

      // Reset image refs
      this.imageRefs = [];
      this.props.images.forEach(() => {
        this.imageRefs.push(React.createRef<HTMLImageElement>());
      });

      // Reset state completely
      this.setState({
        activeIndex: 0,
        translateX: 0,
        imageStatus: new Map<number, ImageStatus>()
      }, () => {
        // Recalculate dimensions after state reset
        this.calculateDimensions();

        // Update visible images
        this.updateVisibleImages(0);
      });
    }
    // Log dimension changes for debugging
    else if (prevState.totalWidth !== this.state.totalWidth ||
        prevState.containerWidth !== this.state.containerWidth) {
      console.log('Dimensions updated:', {
        totalWidth: this.state.totalWidth,
        containerWidth: this.state.containerWidth,
        maxTranslateX: -(this.state.totalWidth - this.state.containerWidth)
      });
    }
  }

  private calculateDimensions = () => {
    if (!this.containerRef.current) return;

    const containerWidth = this.containerRef.current.clientWidth;
    const maxHeight = 300; // Maximum height constraint for all images

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

    // Calculate total width of all images with padding using metadata
    this.props.images.forEach((image, index) => {
      if (image.width && image.height) {
        const aspectRatio = image.width / image.height;
        // All images are constrained by height, so width = height * aspectRatio
        const estimatedWidth = maxHeight * aspectRatio;
        totalWidth += estimatedWidth + (index < this.props.images.length - 1 ? 16 : 0);
      } else {
        // Fallback if dimensions are not available - assume square image
        totalWidth += maxHeight + (index < this.props.images.length - 1 ? 16 : 0);
      }
    });

    // If total content width is less than container width, we don't need to allow dragging
    // Just set totalWidth to match containerWidth exactly
    if (totalWidth <= containerWidth) {
      totalWidth = containerWidth;
    }

    console.log('Calculated dimensions:', { containerWidth, totalWidth });

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

    // Don't allow dragging past the start
    if (newTranslateX > 0) {
      newTranslateX = 0;
    }

    // Don't allow dragging past the end
    const maxTranslateX = -(this.state.totalWidth - this.state.containerWidth);

    // Only apply max boundary if there's actually content that extends beyond the container
    if (this.state.totalWidth > this.state.containerWidth && newTranslateX < maxTranslateX) {
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
    const maxHeight = 300; // Maximum height constraint for all images
    const visibleStart = -translateX;
    const visibleEnd = visibleStart + containerWidth;

    // Buffer zone - load images that are just outside the visible area
    const buffer = containerWidth * 2; // Increased buffer for smoother experience

    let currentPosition = 0;
    const visibleImages = new Set<number>();

    // Always ensure the first image is loaded
    if (this.props.images.length > 0) {
      visibleImages.add(0);
    }

    this.props.images.forEach((image, index) => {
      // Calculate image width based on metadata
      let imageWidth;
      if (image.width && image.height) {
        const aspectRatio = image.width / image.height;
        imageWidth = maxHeight * aspectRatio;
      } else {
        // Fallback if dimensions are not available - assume square image
        imageWidth = maxHeight;
      }

      const imageEnd = currentPosition + imageWidth;

      // If image is visible or within buffer zone, mark it for loading
      if ((currentPosition >= visibleStart - buffer && currentPosition <= visibleEnd + buffer) ||
          (imageEnd >= visibleStart - buffer && imageEnd <= visibleEnd + buffer) ||
          // If any part of the image is in the visible area
          (currentPosition <= visibleEnd && imageEnd >= visibleStart)) {
        visibleImages.add(index);
      }

      currentPosition += imageWidth + 16; // 16px padding between images
    });

    // Update image statuses: set any newly visible images to 'loading'
    this.setState(prevState => {
      const newImageStatus = new Map(prevState.imageStatus);

      // Mark visible images that aren't already loading or loaded
      visibleImages.forEach(index => {
        if (!newImageStatus.has(index)) {
          newImageStatus.set(index, 'loading');
        }
      });

      return { imageStatus: newImageStatus };
    });
  };

  private handleDragEnd = () => {
    if (!this.state.isDragging) return;

    // Just ensure we're within boundaries
    let finalTranslateX = this.state.translateX;

    // Don't allow dragging past the start
    if (finalTranslateX > 0) {
      finalTranslateX = 0;
    }

    // Don't allow dragging past the end
    const maxTranslateX = -(this.state.totalWidth - this.state.containerWidth);

    // Only apply max boundary if there's actually content that extends beyond the container
    if (this.state.totalWidth > this.state.containerWidth && finalTranslateX < maxTranslateX) {
      finalTranslateX = maxTranslateX;
    }

    // Apply the final position with animation
    this.setState({
      translateX: finalTranslateX,
      isDragging: false
    });

    // Update visible images based on final position
    this.updateVisibleImages(finalTranslateX);
  };

  private handleImageLoad = (index: number) => {
    console.log(`Image ${index} loaded naturally`);
    this.setState(prevState => {
      const newImageStatus = new Map(prevState.imageStatus);
      newImageStatus.set(index, 'loaded');
      return { imageStatus: newImageStatus };
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
    const { showControls: showControlsState, translateX, imageStatus, isDragging } = this.state;

    if (images.length === 0) {
      return <div className="no-images">No images available</div>;
    }

    const isSingleImage = images.length === 1;

    // Get visible images (those with status)
    const visibleImages = new Set([...imageStatus.keys()]);

    // If no images are visible yet, show loading state
    if (visibleImages.size === 0 && images.length > 0) {
      return (
        <div className="carousel loading">
          <div className="placeholder-loader">
            <div className="spinner"></div>
          </div>
        </div>
      );
    }

    return (
      <div className="carousel" ref={this.carouselRef}>
        <div className="carousel-content" ref={this.containerRef}>
          <div
            className={`carousel-track ${isDragging ? 'dragging' : ''} ${isSingleImage ? 'single-image' : ''}`}
            style={{ transform: `translateX(${translateX}px)` }}
          >
            {images.map((image, index) => {
              const status = imageStatus.get(index) || 'notLoaded';
              const isVisible = status === 'loading' || status === 'loaded';
              const isLoaded = status === 'loaded';
              const canShowControls = currentUserId && image.userId === currentUserId;

              // Calculate aspect ratio for styling
              const aspectRatio = image.width && image.height ? image.width / image.height : 1;
              const isPortrait = aspectRatio < 1;

              return (
                <div
                  key={image.id}
                  className={`carousel-item ${isPortrait ? 'portrait' : 'landscape'} ${index === images.length - 1 ? 'last-item' : ''}`}
                  onClick={this.handleImageInteraction}
                >
                  {/* Only show image if it should be visible */}
                  {isVisible ? (
                    <img
                      ref={this.imageRefs[index]}
                      src={image.base64Data ?
                        `data:image/jpeg;base64,${image.base64Data.replace(/^data:image\/\w+;base64,/, '')}` :
                        `${image.photoURL}?size=med`
                      }
                      alt={`Photo by ${image.userName}`}
                      className="carousel-image"
                      style={{ opacity: isLoaded ? 1 : 0 }} // Hide image until fully loaded
                      onLoad={() => this.handleImageLoad(index)}
                      onError={(e) => {
                        console.error(`Error loading image: ${image.photoURL}, ${image.id}`);
                      }}
                    />
                  ) : null}

                  {/* Set placeholder with aspect ratio from image dimensions */}
                  <div
                    className={`placeholder-loader ${isLoaded ? 'hidden' : ''}`}
                    style={{
                      '--aspect-ratio': aspectRatio
                    } as React.CSSProperties}
                  >
                    <div className="spinner"></div>
                  </div>

                  {/* Only show the uploader info once image is visible */}
                  {isVisible && (
                    <div className="image-uploader">
                      {image.userName}
                    </div>
                  )}

                  {canShowControls && onImageAction && (showControlsState || ('ontouchstart' in window)) && (
                    <div className="image-controls">
                      <button
                        className="image-control-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onImageAction('replace', image.id);
                        }}
                        disabled={isDeleting}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                        </svg>
                      </button>
                      <button
                        className="image-control-button delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onImageAction('delete', image.id);
                        }}
                        disabled={isDeleting}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                      </button>
                    </div>
                  )}
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