import React from 'react';
import { Capacitor } from '@capacitor/core';
import '../css/bottom-sheet.css';

interface BottomSheetProps {
  open: boolean;
  header?: React.ReactNode;
  children: React.ReactNode;
  snapPoints: number[] | (() => number[]); // Array of heights from bottom in pixels
  onClose: () => void;
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
      this.open();
    }

    // Add mouse/touch event listeners when mounted with open={true}
    if (this.sheetContainerRef.current) {
        this.sheetContainerRef.current.addEventListener('mousedown', this.handleDragStart, { passive: true });
        this.sheetContainerRef.current.addEventListener('mousemove', this.handleDragMove, { passive: false });
        this.sheetContainerRef.current.addEventListener('mouseup', this.handleDragEnd, { passive: true });
        this.sheetContainerRef.current.addEventListener('touchstart', this.handleDragStart, { passive: true });
        this.sheetContainerRef.current.addEventListener('touchmove', this.handleDragMove, { passive: false });
        this.sheetContainerRef.current.addEventListener('touchend', this.handleDragEnd, { passive: true });
    }
  }

  componentDidUpdate(prevProps: BottomSheetProps) {
    // When the sheet opens
    if (this.props.open && !prevProps.open) {
      const snapPoints = this.getSnapPoints();
      const initialSnapPoint = 0;

      this.setState({
        translateY: '0',
        sheetHeight: snapPoints[initialSnapPoint],
        currentSnapPoint: initialSnapPoint
      }, () => {
        this.open();
      });
    }

    // When the sheet closes
    if (!this.props.open && prevProps.open) {
      this.close();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);

    // Remove mouse/touch event listeners
    if (this.sheetContainerRef.current) {
      this.sheetContainerRef.current.removeEventListener('mousedown', this.handleDragStart);
      this.sheetContainerRef.current.removeEventListener('mousemove', this.handleDragMove);
      this.sheetContainerRef.current.removeEventListener('mouseup', this.handleDragEnd);
      this.sheetContainerRef.current.removeEventListener('touchstart', this.handleDragStart);
      this.sheetContainerRef.current.removeEventListener('touchmove', this.handleDragMove);
      this.sheetContainerRef.current.removeEventListener('touchend', this.handleDragEnd);
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
    this.setState({ translateY: '0' });
    if (this.overlayRef.current) {
      this.overlayRef.current.style.opacity = '0';
    }
    this.props.onClose();
  };

  private open = () => {
    this.setState({ translateY: '-100%' });
    if (this.overlayRef.current) {
      this.overlayRef.current.style.opacity = '1';
    }
  };

  private handleDragStart = (e: TouchEvent | MouseEvent) => {
    // Don't handle drag if originated in content container (to allow scrolling of content)
    if (this.contentContainerRef.current &&
        this.contentContainerRef.current.contains(e.target as Node) &&
        this.contentContainerRef.current !== e.target &&
        !(e.target as Element).closest('.header')) {
      return;
    }

    this.setState({
      startDragY: 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY,
      isDragging: true
    });
  };

  private handleDragMove = (e: TouchEvent | MouseEvent) => {
    if (!this.state.isDragging || this.state.startDragY === null) return;

    e.preventDefault();

    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
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

  private handleDragEnd = () => {
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
        this.close();
        return;
      }
    } else if (currentPositionPx < -this.state.sheetHeight * 1.2 && targetSnapIndex < snapPoints.length - 1) {
      targetSnapIndex++;
    }

    this.setState({
      currentSnapPoint: targetSnapIndex,
      sheetHeight: snapPoints[targetSnapIndex]
    }, () => {
      this.open();
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