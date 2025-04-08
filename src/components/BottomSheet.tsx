import React from 'react';
import '../css/bottom-sheet.css';

interface BottomSheetProps {
  open: boolean;
  header?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}

interface BottomSheetState {
  translateY: number;
  startX: number | null;
  startY: number | null;
  lastX: number | null;
  lastY: number | null;
  isDragging: boolean;
  sheetHeight: number;
  paddingBottom: number; // Needs to be in sync with the paddingBottom in the css
  previousTimestamp: number | null;
  velocityY: number;
  dragDirection: 'vertical' | 'horizontal' | null;
}

class BottomSheet extends React.Component<BottomSheetProps, BottomSheetState> {
  private overlayRef = React.createRef<HTMLDivElement>();
  private sheetContainerRef = React.createRef<HTMLDivElement>();
  private resizeObserver: ResizeObserver | null = null;
  private readonly DRAG_DIRECTION_THRESHOLD = 300; // pixels to determine direction
  private readonly VELOCITY_THRESHOLD = 0.5; // pixels per millisecond

  constructor(props: BottomSheetProps) {
    super(props);

    this.state = {
      translateY: window.innerHeight, // Start fully offscreen (at the bottom)
      startX: null,
      startY: null,
      lastX: 0,
      lastY: 0,
      isDragging: false,
      sheetHeight: window.innerHeight,
      paddingBottom: 100,
      previousTimestamp: null,
      velocityY: 0,
      dragDirection: null,
    };
  }

  componentDidMount() {
    const height = this.sheetContainerRef.current?.clientHeight || 0;

    this.setState({
        translateY: height, // Start fully offscreen (at the bottom)
        sheetHeight: height - this.state.paddingBottom,
    });

    // If the sheet is open on mount, animate it in
    if (this.props.open) {
      this.open();
    }

    // Add mouse/touch event listeners when mounted with open={true}
    if (this.sheetContainerRef.current) {
        // Check if touch events are supported
        if ('maxTouchPoints' in navigator) {
            this.sheetContainerRef.current.addEventListener('touchstart', this.handleDragStart, { passive: true });
            this.sheetContainerRef.current.addEventListener('touchmove', this.handleDragMove, { passive: false });
            this.sheetContainerRef.current.addEventListener('touchend', this.handleDragEnd, { passive: true });
        } else {
            this.sheetContainerRef.current.addEventListener('mousedown', this.handleDragStart, { passive: true });
            this.sheetContainerRef.current.addEventListener('mousemove', this.handleDragMove, { passive: false });
            this.sheetContainerRef.current.addEventListener('mouseup', this.handleDragEnd, { passive: true });
        }
    }

    // Set up ResizeObserver to track content height changes
    if (this.sheetContainerRef.current) {
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          console.log(`newHeight: ${newHeight}`);
          this.setState({
            sheetHeight: newHeight + this.state.paddingBottom
          }, () => {
            // If the sheet is closed, update its position to match the new height
            if (!this.props.open) {
              this.setState({ translateY: this.state.sheetHeight + this.state.paddingBottom });
            }
          });
        }
      });

      this.resizeObserver.observe(this.sheetContainerRef.current);
    }
  }

  componentDidUpdate(prevProps: BottomSheetProps) {
    // When the sheet opens
    if (this.props.open && !prevProps.open) {
        this.open();
    }

    // When the sheet closes
    if (!this.props.open && prevProps.open) {
      this.close();
    }
  }

  componentWillUnmount() {
    // Remove mouse/touch event listeners
    if (this.sheetContainerRef.current) {
        // Check if touch events are supported
        if ('maxTouchPoints' in navigator) {
            this.sheetContainerRef.current.removeEventListener('touchstart', this.handleDragStart);
            this.sheetContainerRef.current.removeEventListener('touchmove', this.handleDragMove);
            this.sheetContainerRef.current.removeEventListener('touchend', this.handleDragEnd);
        } else {
            this.sheetContainerRef.current.removeEventListener('mousedown', this.handleDragStart);
            this.sheetContainerRef.current.removeEventListener('mousemove', this.handleDragMove);
            this.sheetContainerRef.current.removeEventListener('mouseup', this.handleDragEnd);
        }
    }

    // Clean up ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private close = () => {
    this.setState({ translateY: this.state.sheetHeight + this.state.paddingBottom});
    if (this.overlayRef.current) {
      this.overlayRef.current.style.opacity = '0';
    }
    this.props.onClose();
  };

  private open = () => {
    this.setState({ translateY: this.state.paddingBottom });
    if (this.overlayRef.current) {
      this.overlayRef.current.style.opacity = '1';
    }
  };

  private handleDragStart = (e: TouchEvent | MouseEvent) => {
    // Get initial touch/mouse coordinates
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    this.setState({
      startY: clientY,
      startX: clientX,
      lastX: clientX,
      lastY: clientY,
      isDragging: true,
      dragDirection: null // Reset drag direction
    });
  };

  private handleDragMove = (e: TouchEvent | MouseEvent) => {
    if (!this.state.isDragging || this.state.startY === null) return;

    e.preventDefault();

    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const currentTranslate = this.state.translateY;

    // Calculate both X and Y deltas
    const deltaY = clientY - this.state.lastY;
    const deltaX = clientX - this.state.lastX;

    // Determine drag direction if not already set
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

    // If we're dragging horizontally, don't update the sheet position
    if (currentDragDirection === 'horizontal') {
      return;
    }

    // slow down drag to a stop after padding
    let finalDeltaY = deltaY;
    if (currentTranslate < this.state.paddingBottom) {
      finalDeltaY = (currentTranslate) / this.state.paddingBottom * deltaY;
    }

    const newTranslate = currentTranslate + finalDeltaY;
    const now = Date.now();

    // Calculate velocity if we have previous timestamp
    let velocityY = 0;
    if (this.state.previousTimestamp !== null) {
      const deltaTime = now - this.state.previousTimestamp;
      velocityY = deltaTime > 0 ? deltaY / deltaTime : 0;
    }

    this.setState({
      translateY: newTranslate,
      startX: clientX,
      startY: clientY,
      lastX: this.state.lastX + deltaX,
      lastY: this.state.lastY + deltaY,
      previousTimestamp: now,
      velocityY
    });

    // Update overlay opacity based on sheet position
    if (this.overlayRef.current) {
      const opacity = Math.max(0, Math.min(1, 1 - (newTranslate - this.state.paddingBottom) / this.state.sheetHeight));
      this.overlayRef.current.style.opacity = opacity.toString();
    }
  };

  private handleDragEnd = () => {
    if (!this.state.isDragging) return;

    const isBelowSpatialThreshold = Math.abs(this.state.translateY) > this.DRAG_DIRECTION_THRESHOLD;
    const isBelowVelocityThreshold = this.state.velocityY > this.VELOCITY_THRESHOLD && this.state.velocityY > 0;

    this.setState({
      isDragging: false,
      startY: null,
      startX: null,
      lastX: null,
      lastY: null,
      previousTimestamp: null,
      velocityY: 0,
      dragDirection: null // Reset drag direction
    });

    if (isBelowSpatialThreshold || isBelowVelocityThreshold) {
      this.close();
    } else {
      this.open();
    }
  };

  private handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === this.overlayRef.current) {
      this.props.onClose();
    }
  };

  render() {
    const { open, header, children } = this.props;
    const { translateY, isDragging } = this.state;

    return (
      <div className={`satlas-bottom-sheet ${!open ? 'closed' : ''}`}>
        <div
          ref={this.overlayRef}
          className="overlay"
          onClick={this.handleOverlayClick}
        />
        <div
          ref={this.sheetContainerRef}
          className={`sheet-container ${isDragging ? 'dragging' : ''}`}
          style={{
            transform: `translateY(${translateY}px)`,
          }}
        >
          <div className="header">
            <div className="handle-bar" />
            {header}
          </div>
          <div
            className="content-container"
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
}

export default BottomSheet;