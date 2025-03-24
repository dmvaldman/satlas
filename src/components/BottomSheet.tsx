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
  startDrag: number | null;
  isDragging: boolean;
  sheetHeight: number;
  paddingBottom: number; // Needs to be in sync with the paddingBottom in the css
}

class BottomSheet extends React.Component<BottomSheetProps, BottomSheetState> {
  private overlayRef = React.createRef<HTMLDivElement>();
  private contentContainerRef = React.createRef<HTMLDivElement>();
  private sheetContainerRef = React.createRef<HTMLDivElement>();
  private resizeObserver: ResizeObserver | null = null;

  constructor(props: BottomSheetProps) {
    super(props);

    this.state = {
      translateY: window.innerHeight, // Start fully offscreen (at the bottom)
      startDrag: null,
      isDragging: false,
      sheetHeight: window.innerHeight,
      paddingBottom: 100,
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
    // Don't handle drag if originated in content container (to allow scrolling of content)
    if (this.contentContainerRef.current &&
        this.contentContainerRef.current.contains(e.target as Node) &&
        this.contentContainerRef.current !== e.target &&
        !(e.target as Element).closest('.header')) {
      return;
    }

    this.setState({
      startDrag: 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY,
      isDragging: true
    });
  };

  private handleDragMove = (e: TouchEvent | MouseEvent) => {
    if (!this.state.isDragging || this.state.startDrag === null) return;

    e.preventDefault();

    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const currentTranslate = this.state.translateY;
    let deltaY = clientY - this.state.startDrag;

    console.log(`currentTranslate: ${currentTranslate}, deltaY: ${deltaY}, topMargin: ${this.state.paddingBottom}`);

    // slow down drag to a stop after padding
    if (currentTranslate < this.state.paddingBottom) {
      deltaY = (currentTranslate) / this.state.paddingBottom * deltaY;
    }

    const newTranslate = currentTranslate + deltaY;

    this.setState({
      translateY: newTranslate,
      startDrag: clientY
    });

    // Update overlay opacity based on sheet position
    if (this.overlayRef.current) {
      const opacity = Math.max(0, Math.min(1, 1 - (newTranslate - this.state.paddingBottom) / this.state.sheetHeight));
      this.overlayRef.current.style.opacity = opacity.toString();
    }
  };

  private handleDragEnd = () => {
    if (!this.state.isDragging) return;

    this.setState({ isDragging: false, startDrag: null });

    if (this.state.translateY > this.state.sheetHeight * 0.5) {
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