import React from 'react';
import { Capacitor } from '@capacitor/core';
import '../css/bottom-sheet.css';

interface BottomSheetProps {
  open: boolean;
  onDismiss: () => void;
  header?: React.ReactNode;
  children: React.ReactNode;
  snapPoints: number[] | (() => number[]); // Array of heights from bottom in pixels
}

interface BottomSheetState {
  translateY: string;
  startDragY: number | null;
  isDragging: boolean;
  currentSnapPoint: number;
  sheetHeight: number;
}

class BottomSheet extends React.Component<BottomSheetProps, BottomSheetState> {
  private overlayRef = React.createRef<HTMLDivElement>();
  private contentContainerRef = React.createRef<HTMLDivElement>();
  private sheetContainerRef = React.createRef<HTMLDivElement>();

  constructor(props: BottomSheetProps) {
    super(props);

    // Calculate initial sheet height from first snap point
    const snapPoints = this.getSnapPoints();
    const initialHeight = snapPoints.length > 0 ? snapPoints[0] : window.innerHeight * 0.5;

    this.state = {
      translateY: '0', // Start fully offscreen (at the bottom)
      startDragY: null,
      isDragging: false,
      currentSnapPoint: 0,
      sheetHeight: initialHeight,
    };
  }

  componentDidMount() {
    window.addEventListener('resize', this.handleResize);

    // Add platform class to body for platform-specific CSS
    if (Capacitor.getPlatform() === 'android') {
      document.body.classList.add('android');
    } else if (Capacitor.getPlatform() === 'ios') {
      document.body.classList.add('ios');
    }

    // If the sheet is open on mount, animate it in
    if (this.props.open) {
      requestAnimationFrame(() => {
        this.animateToPosition('-100%');
      });

      // Add touch event listeners when mounted with open={true}
      if (this.sheetContainerRef.current) {
        this.sheetContainerRef.current.addEventListener('touchstart', this.handleTouchStartDirect, { passive: true });
        this.sheetContainerRef.current.addEventListener('touchmove', this.handleTouchMoveDirect, { passive: false });
        this.sheetContainerRef.current.addEventListener('touchend', this.handleTouchEndDirect, { passive: true });
      }
    }
  }

  componentDidUpdate(prevProps: BottomSheetProps) {
    // When the sheet opens
    if (this.props.open && !prevProps.open) {
      const snapPoints = this.getSnapPoints();
      const initialSnapPoint = 0;

      this.setState({
        translateY: '100%',
        sheetHeight: snapPoints[initialSnapPoint],
        currentSnapPoint: initialSnapPoint
      }, () => {
        requestAnimationFrame(() => {
          this.animateToPosition('-100%');
        });
      });

      // Add touch event listeners when opening
      if (this.sheetContainerRef.current) {
        this.sheetContainerRef.current.addEventListener('touchstart', this.handleTouchStartDirect, { passive: true });
        this.sheetContainerRef.current.addEventListener('touchmove', this.handleTouchMoveDirect, { passive: false });
        this.sheetContainerRef.current.addEventListener('touchend', this.handleTouchEndDirect, { passive: true });
      }
    }

    // When the sheet closes
    if (!this.props.open && prevProps.open) {
      this.close();

      // Remove touch event listeners when closing
      if (this.sheetContainerRef.current) {
        this.sheetContainerRef.current.removeEventListener('touchstart', this.handleTouchStartDirect);
        this.sheetContainerRef.current.removeEventListener('touchmove', this.handleTouchMoveDirect);
        this.sheetContainerRef.current.removeEventListener('touchend', this.handleTouchEndDirect);
      }
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);

    // Remove touch event listeners
    if (this.sheetContainerRef.current) {
      this.sheetContainerRef.current.removeEventListener('touchstart', this.handleTouchStartDirect);
      this.sheetContainerRef.current.removeEventListener('touchmove', this.handleTouchMoveDirect);
      this.sheetContainerRef.current.removeEventListener('touchend', this.handleTouchEndDirect);
    }
  }

  private getSnapPoints = (): number[] => {
    const { snapPoints } = this.props;
    return typeof snapPoints === 'function' ? snapPoints() : snapPoints;
  };

  private handleResize = () => {
    if (this.props.open) {
      const snapPoints = this.getSnapPoints();
      this.setState({
        sheetHeight: snapPoints[this.state.currentSnapPoint]
      });
    }
  };

  private animateToPosition = (targetPosition: string) => {
    this.setState({ translateY: targetPosition });

    // Update overlay opacity based on position
    if (this.overlayRef.current) {
      const opacity = targetPosition === '-100%' ? 1 : 0;
      this.overlayRef.current.style.opacity = opacity.toString();
    }
  };

  private close = () => {
    this.setState({ translateY: '100%' });
    if (this.overlayRef.current) {
      this.overlayRef.current.style.opacity = '0';
    }
  };

  private handleTouchStartDirect = (e: TouchEvent) => {
    // Don't handle drag if originated in content container (to allow scrolling of content)
    if (this.contentContainerRef.current &&
        this.contentContainerRef.current.contains(e.target as Node) &&
        this.contentContainerRef.current !== e.target &&
        !(e.target as Element).closest('.header')) {
      return;
    }

    this.setState({
      startDragY: e.touches[0].clientY,
      isDragging: true
    });
  };

  private handleTouchMoveDirect = (e: TouchEvent) => {
    if (!this.state.isDragging || this.state.startDragY === null) return;

    e.preventDefault();

    const clientY = e.touches[0].clientY;
    const deltaY = clientY - this.state.startDragY;
    const currentTranslateYPx = this.getCurrentTranslateYInPixels();
    let newTranslateYPx = currentTranslateYPx + deltaY;

    // Apply resistance when dragging beyond limits
    if (newTranslateYPx > 0) {
      newTranslateYPx = newTranslateYPx * 0.2;
    } else if (newTranslateYPx < -window.innerHeight) {
      newTranslateYPx = -window.innerHeight + (newTranslateYPx + window.innerHeight) * 0.2;
    }

    const newTranslateYPercentage = `${(newTranslateYPx / this.state.sheetHeight) * 100}%`;

    this.setState({
      translateY: newTranslateYPercentage,
      startDragY: clientY
    });

    // Update overlay opacity based on sheet position
    if (this.overlayRef.current) {
      const percentValue = parseFloat(newTranslateYPercentage);
      const opacity = -percentValue / 100;
      this.overlayRef.current.style.opacity = opacity.toString();
    }
  };

  private handleTouchEndDirect = () => {
    if (!this.state.isDragging) return;

    this.setState({ isDragging: false, startDragY: null });

    const snapPoints = this.getSnapPoints();
    const currentPositionPx = this.getCurrentTranslateYInPixels();
    let targetSnapIndex = this.state.currentSnapPoint;

    // Handle snap point changes based on drag position
    if (currentPositionPx > -this.state.sheetHeight * 0.8) {
      if (targetSnapIndex > 0) {
        targetSnapIndex--;
      } else {
        this.props.onDismiss();
        return;
      }
    } else if (currentPositionPx < -this.state.sheetHeight * 1.2 && targetSnapIndex < snapPoints.length - 1) {
      targetSnapIndex++;
    }

    this.setState({
      currentSnapPoint: targetSnapIndex,
      sheetHeight: snapPoints[targetSnapIndex]
    }, () => {
      this.animateToPosition('-100%');
    });
  };

  private getCurrentTranslateYInPixels = (): number => {
    const translateY = this.state.translateY;
    if (translateY.endsWith('%')) {
      const percentage = parseFloat(translateY);
      return (percentage / 100) * this.state.sheetHeight;
    }
    return parseFloat(translateY) || 0;
  };

  private handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === this.overlayRef.current) {
      this.props.onDismiss();
    }
  };

  private preventTouchPropagation = (e: React.TouchEvent) => {
    // Remove scroll prevention since we're not scrolling anymore
  };

  private handleMouseDown = (e: React.MouseEvent) => {
    // Don't handle drag if originated in content container (to allow scrolling of content)
    if (this.contentContainerRef.current &&
        this.contentContainerRef.current.contains(e.target as Node) &&
        this.contentContainerRef.current !== e.target) {
      return;
    }

    this.setState({
      startDragY: e.clientY,
      isDragging: true
    });
  };

  private handleMouseMove = (e: React.MouseEvent) => {
    if (!this.state.isDragging || this.state.startDragY === null) return;

    const clientY = e.clientY;
    const deltaY = clientY - this.state.startDragY;
    const currentTranslateYPx = this.getCurrentTranslateYInPixels();
    let newTranslateYPx = currentTranslateYPx + deltaY;

    // Apply resistance when dragging beyond limits
    if (newTranslateYPx > 0) {
      newTranslateYPx = newTranslateYPx * 0.2;
    } else if (newTranslateYPx < -window.innerHeight) {
      newTranslateYPx = -window.innerHeight + (newTranslateYPx + window.innerHeight) * 0.2;
    }

    const newTranslateYPercentage = `${(newTranslateYPx / this.state.sheetHeight) * 100}%`;

    this.setState({
      translateY: newTranslateYPercentage,
      startDragY: clientY
    });

    // Update overlay opacity based on sheet position
    if (this.overlayRef.current) {
      const percentValue = parseFloat(newTranslateYPercentage);
      const opacity = 0.5 * (-percentValue / 100);
      this.overlayRef.current.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
    }
  };

  private handleMouseUp = () => {
    this.handleTouchEndDirect();
  };

  private handleMouseLeave = () => {
    if (this.state.isDragging) {
      this.handleTouchEndDirect();
    }
  };

  render() {
    const { open, header, children } = this.props;
    const { translateY, isDragging, sheetHeight } = this.state;

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
          onMouseDown={this.handleMouseDown}
          onMouseMove={this.handleMouseMove}
          onMouseUp={this.handleMouseUp}
          onMouseLeave={this.handleMouseLeave}
          style={{
            transform: `translateY(${translateY})`,
          }}
        >
          <div className="header">
            <div className="handle-bar" />
            {header}
          </div>
          <div
            ref={this.contentContainerRef}
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