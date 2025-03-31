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
}

class BaseModal extends React.Component<BaseModalProps, BaseModalState> {
  constructor(props: BaseModalProps) {
    super(props);
    this.state = {
      isActive: false
    };
  }

  componentDidMount() {
    if (this.props.isOpen) {
      requestAnimationFrame(() => {
        this.setState({ isActive: true });
      });
    }
  }

  componentDidUpdate(prevProps: BaseModalProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      // Modal is opening
      requestAnimationFrame(() => {
        this.setState({ isActive: true });
      });
    } else if (prevProps.isOpen && !this.props.isOpen) {
      // Modal is closing
      requestAnimationFrame(() => {
        this.setState({ isActive: false });
      });
    }
  }

  private handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    this.props.onClose();
  };

  render() {
    const { isOpen, children, className = '', contentClassName = '' } = this.props;
    const { isActive } = this.state;

    if (!isOpen) return null;

    return (
      <div
        className={`modal-overlay ${isOpen ? 'active' : ''} ${className}`}
        style={{ display: isOpen ? 'flex' : 'none' }}
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