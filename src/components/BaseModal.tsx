import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

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
      this.setState({ isVisible: true }, () => {
        requestAnimationFrame(() => {
          this.setState({ isActive: true });
        });
      });
    }
    if (Capacitor.isNativePlatform()) {
      Keyboard.addListener('keyboardWillShow', this.handleKeyboardShow);
      Keyboard.addListener('keyboardWillHide', this.handleKeyboardHide);
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
    if (Capacitor.isNativePlatform()) {
      Keyboard.removeAllListeners();
    }
  }

  private handleKeyboardShow = (event: { keyboardHeight: number }) => {
    this.setState({
      isKeyboardVisible: true,
      keyboardHeight: event.keyboardHeight
    });
  };

  private handleKeyboardHide = () => {
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