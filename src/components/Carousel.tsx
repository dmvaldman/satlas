import React from 'react';
import { Image } from '../types';
import { OfflineService } from '../services/OfflineService';
import { Capacitor } from '@capacitor/core';

interface CarouselProps {
  images: Image[];
  currentUserId: string | null;
  onImageDelete: (imageId: string) => void;
  onImageReplace: (imageId: string) => void;
  onOpenFullscreenImage: (image: Image) => void;
  onImageFlag?: (imageId: string) => void;
  onBlockUser?: (userId: string, username: string) => void;
}

// Define image status types
type ImageStatus = 'notLoaded' | 'loading' | 'loaded';

interface CarouselState {
  translateX: number;
  startX: number;
  startY: number;
  isDragging: boolean;
  containerWidth: number;
  totalWidth: number;
  imageStatuses: ImageStatus[]; // Array instead of Map
  lastMoveTimestamp: number;
  lastPositionX: number;
  lastPositionY: number;
  velocity: number;
  dragDirection: 'horizontal' | 'vertical' | null;
}

class Carousel extends React.Component<CarouselProps, CarouselState> {
  private containerRef = React.createRef<HTMLDivElement>();
  private imageRefs: React.RefObject<HTMLImageElement>[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private momentumAnimationId: number | null = null;
  private padding = 16; // Match CSS
  private defaultHeight = 350; // Match CSS

  constructor(props: CarouselProps) {
    super(props);

    // Initialize image refs
    this.imageRefs = this.props.images.map(() => React.createRef<HTMLImageElement>());

    this.state = {
      translateX: 0,
      startX: 0,
      startY: 0,
      isDragging: false,
      containerWidth: 0,
      totalWidth: 0,
      imageStatuses: Array(this.props.images.length).fill('notLoaded'),
      lastMoveTimestamp: 0,
      lastPositionX: 0,
      lastPositionY: 0,
      velocity: 0,
      dragDirection: null,
    };
  }

  componentDidMount() {
    console.log('Carousel mounted with images:', this.props.images.length);

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

    // Initialize all images to loading state
    this.setState({
      imageStatuses: Array(this.props.images.length).fill('loading')
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

    // Cancel any ongoing momentum animation
    if (this.momentumAnimationId !== null) {
      cancelAnimationFrame(this.momentumAnimationId);
    }
  }

  componentDidUpdate(prevProps: CarouselProps, prevState: CarouselState) {
    // If images array changed (e.g., after deletion or when a new sit is loaded)
    if (prevProps.images !== this.props.images) {
      // Reset image refs array to match new images array
      this.imageRefs = this.props.images.map(() => React.createRef<HTMLImageElement>());

      // New images should have loading state, but keep status of existing images
      const newImageStatuses = Array(this.props.images.length).fill('loading');
      this.props.images.forEach((newImage, newIndex) => {
        const oldIndex = prevProps.images.findIndex(oldImage => oldImage.id === newImage.id);
        if (oldIndex >= 0) {
          newImageStatuses[newIndex] = prevState.imageStatuses[oldIndex];
        }
      });

      // Cancel any ongoing momentum animation
      if (this.momentumAnimationId !== null) {
        cancelAnimationFrame(this.momentumAnimationId);
        this.momentumAnimationId = null;
      }

      // Always reset to the beginning when images change
      this.setState({
        imageStatuses: newImageStatuses,
        translateX: 0, // Explicitly set to 0 to show first image
        velocity: 0
      }, () => {
        // Recalculate dimensions with the new images
        this.calculateDimensions();
      });
    }
    else if (prevState.containerWidth !== this.state.containerWidth) {
      // Recalculate total width if container size changed
      this.calculateDimensions();
    }
  }

  // Helper method to calculate image dimensions consistently across the component
  private calculateImageDimensions(
    image: Image,
    containerWidth: number,
    carouselHeight: number,
    hasMultipleImages: boolean
  ): { width: number; height: number } {
    const aspectRatio = image.width / image.height;
    let imageWidth = Math.floor(carouselHeight * aspectRatio);

    // If multiple images, limit width to 90% of container to show next image
    if (hasMultipleImages && imageWidth >= containerWidth * 0.9) {
      imageWidth = Math.floor(containerWidth * 0.9);
    }
    else if (imageWidth > containerWidth) {
      // If image width exceeds container width, set to container width and adjust height
      imageWidth = containerWidth;
    }

    return { width: imageWidth, height: carouselHeight };
  }

  private calculateDimensions = () => {
    if (!this.containerRef.current) return;

    const containerWidth = this.containerRef.current.clientWidth;
    const carouselHeight = this.containerRef.current.clientHeight; // Maximum height constraint
    const hasMultipleImages = this.props.images.length > 1;

    // Calculate total width using the known image dimensions
    let totalWidth = 0;
    this.props.images.forEach((image, index) => {
      const padding = index < this.props.images.length - 1 ? this.padding : 0;
      const { width: imageWidth } = this.calculateImageDimensions(
        image,
        containerWidth,
        carouselHeight,
        hasMultipleImages
      );

      totalWidth += imageWidth + padding;
    });

    // If total content width is less than container width, or only one image, disable scrolling
    const shouldDisableScrolling = totalWidth <= containerWidth || this.props.images.length <= 1;
    if (shouldDisableScrolling) {
      totalWidth = containerWidth;
    }

    console.log('Calculated dimensions:', {
      containerWidth,
      totalWidth,
      shouldDisableScrolling,
      images: this.props.images.length
    });

    this.setState({
      containerWidth,
      totalWidth
    });
  };

  private handleResize = () => {
    // Keep current translateX ratio when resizing
    const prevContainerWidth = this.state.containerWidth;
    const prevTotalWidth = this.state.totalWidth;
    const prevTranslateX = this.state.translateX;

    // Calculate the current scroll percentage before resize
    const scrollPercentage = prevContainerWidth && prevTotalWidth > prevContainerWidth ?
      -prevTranslateX / (prevTotalWidth - prevContainerWidth) : 0;

    // Calculate dimensions first
    this.calculateDimensions();

    // Now update translateX based on new dimensions and previous scroll percentage
    this.setState(prevState => {
      const maxTranslateX = prevState.totalWidth > prevState.containerWidth ?
        -(prevState.totalWidth - prevState.containerWidth) : 0;

      // Apply the same scroll percentage to the new dimensions
      const newTranslateX = Math.max(maxTranslateX, Math.min(0, maxTranslateX * scrollPercentage));

      return { translateX: newTranslateX };
    });
  };

  private handleDragStart = (e: MouseEvent | TouchEvent) => {
    // Prevent dragging if all images fit within the container
    if (this.state.totalWidth <= this.state.containerWidth || this.props.images.length <= 1) {
      return;
    }

    // Don't prevent default for touchstart to allow scrolling if needed
    if (!('touches' in e)) {
      e.preventDefault();
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // Cancel any ongoing momentum animation
    if (this.momentumAnimationId !== null) {
      cancelAnimationFrame(this.momentumAnimationId);
      this.momentumAnimationId = null;
    }

    this.setState({
      startX: clientX,
      startY: clientY,
      lastPositionX: clientX,
      lastPositionY: clientY,
      isDragging: true,
      lastMoveTimestamp: performance.now(),
      velocity: 0,
      dragDirection: null // Reset drag direction
    });
  };

  private handleDragMove = (e: MouseEvent | TouchEvent) => {
    // Explicitly prevent dragging for single images
    if (this.props.images.length <= 1) {
      return;
    }

    if (!this.state.isDragging) return;

    // Always prevent default during drag to prevent page scrolling
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const currentTime = performance.now();
    const timeElapsed = currentTime - this.state.lastMoveTimestamp;
    const deltaX = clientX - this.state.lastPositionX;
    const deltaY = clientY - this.state.lastPositionY;
    // const dispX = Math.abs(clientX - this.state.startX);
    // const dispY = Math.abs(clientY - this.state.startY);

    let currentDragDirection = this.state.dragDirection;

    if (currentDragDirection === null) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        currentDragDirection = 'horizontal';
      } else if (Math.abs(deltaY) > Math.abs(deltaX)) {
        currentDragDirection = 'vertical';
      }
      this.setState({
        dragDirection: currentDragDirection
      });
    }

    // If we're dragging vertically, don't update the carousel position
    if (this.state.dragDirection === 'vertical') {
      return;
    }

    // Calculate velocity (pixels per millisecond)
    let velocity = 0;
    if (timeElapsed > 0) {
      velocity = deltaX / timeElapsed;
    }

    // Calculate new translateX with boundaries
    let newTranslateX = this.state.translateX + deltaX;

    // Don't allow dragging past the start
    if (newTranslateX > 0) newTranslateX = 0;

    // Don't allow dragging past the end
    const maxTranslateX = -(this.state.totalWidth - this.state.containerWidth);
    if (this.state.totalWidth > this.state.containerWidth && newTranslateX < maxTranslateX) {
      newTranslateX = maxTranslateX;
    }

    this.setState({
      translateX: newTranslateX,
      lastPositionX: clientX,
      lastPositionY: clientY,
      lastMoveTimestamp: currentTime,
      velocity: velocity
    });

    // Determine which images should be loaded based on visibility
    this.updateVisibleImages(newTranslateX);
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

    // Check if we should apply momentum scrolling
    // Only apply momentum if the velocity is significant
    const shouldApplyMomentum = this.state.dragDirection === 'horizontal' && Math.abs(this.state.velocity) > 0.01 &&
      this.state.totalWidth > this.state.containerWidth;


    this.setState({
      translateX: finalTranslateX,
      isDragging: shouldApplyMomentum,
      dragDirection: null // Reset drag direction
    }, () => {
      // Start momentum animation if needed
      if (shouldApplyMomentum) {
        this.momentumAnimationId = requestAnimationFrame(this.applyMomentum);
      }
    });
  };

  private applyMomentum = () => {
    // Calculate new position based on velocity with deceleration
    const deceleration = 0.9; // Slower deceleration for smoother feel
    const newVelocity = this.state.velocity * deceleration;

    // Calculate distance to move this frame (velocity is px/ms)
    const frameDelta = newVelocity * 16; // Assuming ~16ms per frame at 60fps

    let newTranslateX = this.state.translateX + frameDelta;

    // Apply boundaries
    if (newTranslateX > 0) {
      newTranslateX = 0;
    } else {
      const maxTranslateX = -(this.state.totalWidth - this.state.containerWidth);
      if (this.state.totalWidth > this.state.containerWidth && newTranslateX < maxTranslateX) {
        newTranslateX = maxTranslateX;
      }
    }

    // Update state
    this.setState({
      translateX: newTranslateX,
      velocity: newVelocity
    });

    // Stop animation if velocity is very low or we've hit a boundary
    if (Math.abs(newVelocity) < 0.001 ||
        newTranslateX === 0 ||
        (this.state.totalWidth > this.state.containerWidth &&
         newTranslateX === -(this.state.totalWidth - this.state.containerWidth))) {
      this.momentumAnimationId = null;
      this.setState({
        isDragging: false
      });
      return;
    }

    // Continue animation
    this.momentumAnimationId = requestAnimationFrame(this.applyMomentum);
  };

  private updateVisibleImages = (translateX: number) => {
    if (!this.containerRef.current) return;

    const containerWidth = this.containerRef.current.clientWidth;
    const visibleStart = -translateX;
    const visibleEnd = visibleStart + containerWidth;

    // We'll load images with a buffer zone
    const buffer = containerWidth;

    let currentPosition = 0;
    const newImageStatuses = [...this.state.imageStatuses];
    const carouselHeight = this.containerRef.current.clientHeight;
    const hasMultipleImages = this.props.images.length > 1;

    this.props.images.forEach((image, index) => {
      const { width: imageWidth } = this.calculateImageDimensions(
        image,
        containerWidth,
        carouselHeight,
        hasMultipleImages
      );

      const imageEnd = currentPosition + imageWidth;

      // If image is visible or within buffer zone, mark for loading
      if ((currentPosition >= visibleStart - buffer && currentPosition <= visibleEnd + buffer) ||
          (imageEnd >= visibleStart - buffer && imageEnd <= visibleEnd + buffer)) {
        // Only update status if it's not already loading or loaded
        if (newImageStatuses[index] === 'notLoaded') {
          newImageStatuses[index] = 'loading';
        }
      }

      currentPosition += imageWidth + this.padding;
    });

    // Only update state if anything changed
    if (newImageStatuses.some((status, i) => status !== this.state.imageStatuses[i])) {
      this.setState({ imageStatuses: newImageStatuses });
    }
  };

  private handleImageLoad = (index: number) => {
    console.log(`Image ${index} loaded`);

    // Update the status of this image to loaded
    this.setState(prevState => {
      const newImageStatuses = [...prevState.imageStatuses];
      newImageStatuses[index] = 'loaded';
      return { imageStatuses: newImageStatuses };
    });
  };

  private handleImageClick = (image: Image, e: React.MouseEvent) => {
    // Ignore clicks while dragging
    if (this.state.isDragging) {
      return;
    }

    console.log('handleImageClick', image);
    e.stopPropagation();
    this.props.onOpenFullscreenImage(image);
  };

  private isImageUploading = (image: Image) => {
    // If we're offline, images are never "uploading"
    if (!OfflineService.getInstance().isNetworkOnline()) {
      return false;
    }
    // If the image ID starts with "temp_", it's still uploading
    return image.id.startsWith('temp_');
  };

  render() {
    const { images, currentUserId, onImageDelete, onImageReplace, onImageFlag, onBlockUser } = this.props;
    const {
      translateX,
      imageStatuses,
      isDragging,
      containerWidth,
      totalWidth
    } = this.state;

    // Check if images are still loading initially (passed as empty array)
    const isLoadingInitially = images.length === 0;

    const isScrollDisabled = totalWidth <= containerWidth || isLoadingInitially || images.length <= 1;
    const carouselHeight = this.containerRef.current?.clientHeight || this.defaultHeight;
    const hasMultipleImages = images.length > 1;

    return (
      <>
        <div className="carousel-content" ref={this.containerRef}>
          <div
            className={`carousel-track ${isDragging ? 'dragging' : ''} ${isScrollDisabled ? 'scroll-disabled' : ''}`}
            style={{
              transform: `translateX(${translateX}px)`
            }}
          >
            {isLoadingInitially ? (
              // Show a single placeholder/spinner when loading initially
              <div
                className="carousel-item placeholder-loader"
                style={{
                   width: '100%', // Take full width
                   height: `${carouselHeight}px`
                }}
              >
                <div className="spinner medium"></div>
              </div>
            ) : (
              // Render actual images when available
              images.map((image, index) => {
                const status = imageStatuses[index] || 'notLoaded';
                const isVisible = status === 'loading' || status === 'loaded';
                const isLoaded = status === 'loaded';
                const canShowControls = currentUserId && (image.userId === currentUserId || currentUserId === 'bEorC36iZYZGWKydUqFo6VZ7RSn2');

                const { width: imageWidth, height: imageHeight } = this.calculateImageDimensions(
                  image,
                  containerWidth,
                  carouselHeight,
                  hasMultipleImages
                );

                return (
                  <div
                    key={image.id}
                    className={`carousel-item ${index === images.length - 1 ? 'last-item' : ''}`}
                    style={{
                      width: `${Math.floor(imageWidth)}px`,
                      height: `${carouselHeight}px`
                    }}
                  >
                    {isVisible ? (
                      <img
                        ref={this.imageRefs[index]}
                        src={image.base64Data ?
                          `data:image/jpeg;base64,${image.base64Data.replace(/^data:image\/\w+;base64,/, '')}` :
                          `${image.photoURL}?size=med`
                        }
                        alt={`Photo by ${image.userName}`}
                        className="carousel-image"
                        style={{
                          opacity: isLoaded ? 1 : 0,
                          width: `${Math.floor(imageWidth)}px`,
                          height: `${imageHeight}px`
                        }}
                        onLoad={() => this.handleImageLoad(index)}
                        onError={(e) => {
                          console.error(`Error loading image: ${image.photoURL}, ${image.id}, ${e}`);
                        }}
                        onClick={(e) => this.handleImageClick(image, e)}
                      />
                    ) : null}
                    <div
                      className={`placeholder-loader ${isLoaded ? 'hidden' : ''}`}
                      style={{
                        width: `${imageWidth}px`,
                        height: `${imageHeight}px`
                      }}
                    >
                      <div className="spinner medium"></div>
                    </div>
                    {isVisible && (
                      <div className="image-uploader">
                        {/* Make username clickable if it's not the current user and onBlockUser is provided */}
                        {currentUserId &&
                         image.userId !== currentUserId &&
                         onBlockUser ? (
                          <span
                            className="image-uploader-name clickable"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBlockUser(image.userId, image.userName);
                            }}
                          >
                            {image.userName}
                          </span>
                        ) : (
                          image.userName
                        )}
                      </div>
                    )}
                    {canShowControls && (
                      <div className="image-controls">
                        {this.isImageUploading(image) ? (
                          <div className="image-upload-loading active">
                            <div className="spinner small"></div>
                          </div>
                        ) : (
                          <>
                            <button
                              className="image-control-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onImageReplace(image.id);
                              }}
                              title="Replace photo"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                              </svg>
                            </button>
                            <button
                              className="image-control-button delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                onImageDelete(image.id);
                              }}
                              title="Delete photo"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {!canShowControls && currentUserId && onImageFlag && (
                      <div className="image-controls">
                        <button
                          className="image-control-button flag"
                          onClick={(e) => {
                            e.stopPropagation();
                            onImageFlag(image.id);
                          }}
                          title="Report objectionable content"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                            <line x1="4" y1="22" x2="4" y2="15"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </>
    );
  }
}

export default Carousel;