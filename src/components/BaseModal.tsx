import React from 'react';

interface BaseModalProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  onClose: () => void;
}

interface BaseModalState {
  isActive: boolean;
  isVisible: boolean;
}

class BaseModal extends React.Component<BaseModalProps, BaseModalState> {
  private animationTimeout: number | null = null;

  constructor(props: BaseModalProps) {
    super(props);
    this.state = {
      isActive: false,
      isVisible: false
    };
  }

  componentDidMount() {
    if (this.props.isOpen) {
      this.setState({ isVisible: true }, () => {
        requestAnimationFrame(() => {
          this.setState({ isActive: true });
        });
      });
    }
  }

  componentDidUpdate(prevProps: BaseModalProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      // Modal is opening
      this.setState({ isVisible: true }, () => {
        requestAnimationFrame(() => {
          this.setState({ isActive: true });
        });
      });
    } else if (prevProps.isOpen && !this.props.isOpen) {
      // Modal is closing
      this.setState({ isActive: false });

      // Clear any existing timeout
      if (this.animationTimeout) {
        window.clearTimeout(this.animationTimeout);
      }

      // Wait for animation to complete before removing from DOM
      this.animationTimeout = window.setTimeout(() => {
        this.setState({ isVisible: false });
      }, 300); // Match the CSS transition duration
    }
  }

  componentWillUnmount() {
    if (this.animationTimeout) {
      window.clearTimeout(this.animationTimeout);
    }
  }

  private handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    this.props.onClose();
  };

  render() {
    const { children, className = '', contentClassName = '' } = this.props;
    const { isActive, isVisible } = this.state;

    if (!isVisible) return null;

    return (
      <div
        className={`modal-overlay ${isActive ? 'active' : ''} ${className}`}
        onClick={this.handleClose}
      >
        <div
          className={`modal-content ${isActive ? 'active' : ''} ${contentClassName}`}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    );
  }
}

export default BaseModal;