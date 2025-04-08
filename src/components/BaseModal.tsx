import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo } from '@capacitor/keyboard';

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
  isKeyboardVisible: boolean;
  keyboardHeight: number;
}

class BaseModal extends React.Component<BaseModalProps, BaseModalState> {
  private animationTimeout: number | null = null;

  constructor(props: BaseModalProps) {
    super(props);
    this.state = {
      isActive: false,
      isVisible: false,
      isKeyboardVisible: false,
      keyboardHeight: 0
    };
  }

  componentDidMount() {
    if (this.props.isOpen) {
      this.openModal();
    }

    if (Capacitor.isNativePlatform()) {
      Keyboard.addListener('keyboardWillShow', this.handleKeyboardShow);
      Keyboard.addListener('keyboardWillHide', this.handleKeyboardHide);
    }
  }

  componentDidUpdate(prevProps: BaseModalProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      this.openModal();
    } else if (prevProps.isOpen && !this.props.isOpen) {
      this.closeModal();
    }
  }

  componentWillUnmount() {
    if (this.animationTimeout) {
      window.clearTimeout(this.animationTimeout);
    }

    if (Capacitor.isNativePlatform()) {
      Keyboard.removeAllListeners();
    }
  }

  private openModal() {
    this.setState({ isVisible: true }, () => {
      requestAnimationFrame(() => {
        this.setState({ isActive: true });
      });
    });
  }

  private closeModal() {
    this.setState({ isActive: false });
    if (this.animationTimeout) {
      window.clearTimeout(this.animationTimeout);
    }
    this.animationTimeout = window.setTimeout(() => {
      this.setState({ isVisible: false });
    }, 300); // Match the CSS transition duration
  }

  // --- Native Keyboard Handler ---
  private handleKeyboardShow = (event: KeyboardInfo) => {
    this.setState({
      isKeyboardVisible: true,
      // Use actual height on native iOS/Android (Android needs height, iOS viewport resizes)
      keyboardHeight: Capacitor.getPlatform() === 'android' ? event.keyboardHeight : 0
    });
  };

  // --- Native Keyboard Handler ---
  private handleKeyboardHide = () => {
    // Only applies on native
    this.setState({
      isKeyboardVisible: false,
      keyboardHeight: 0
    });
  };

  private handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    this.props.onClose();
  };

  render() {
    const { children, className = '', contentClassName = '' } = this.props;
    const { isActive, isVisible, isKeyboardVisible, keyboardHeight } = this.state;

    if (!isVisible) return null;

    return (
      <div
        className={`modal-overlay ${isActive ? 'active' : ''} ${className}`}
        onClick={this.handleClose}
      >
        <div
          className={`modal-content ${isActive ? 'active' : ''} ${isKeyboardVisible ? 'keyboard-visible' : ''} ${contentClassName}`}
          onClick={e => e.stopPropagation()}
          style={{ '--keyboard-height-px': `${keyboardHeight}px` } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    );
  }
}

export default BaseModal;