import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo, KeyboardListenerCallback } from '@capacitor/keyboard';

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
  // Store listener handles to remove them specifically
  private keyboardWillShowListener: any = null;
  private keyboardWillHideListener: any = null;


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
    // Always try to add listeners - Capacitor Keyboard might work on web/PWA
    this.addKeyboardListeners();
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
    // Always try to remove listeners
    this.removeKeyboardListeners();
  }

  // Helper methods to add/remove listeners
  private addKeyboardListeners = async () => {
    try {
      this.keyboardWillShowListener = await Keyboard.addListener('keyboardWillShow', this.handleKeyboardShow);
      this.keyboardWillHideListener = await Keyboard.addListener('keyboardWillHide', this.handleKeyboardHide);
    } catch (e) {
      console.warn("Could not add keyboard listeners. Keyboard plugin might not be available.", e);
    }
  }

  private removeKeyboardListeners = () => {
    if (this.keyboardWillShowListener) {
      this.keyboardWillShowListener.remove();
      this.keyboardWillShowListener = null;
    }
    if (this.keyboardWillHideListener) {
      this.keyboardWillHideListener.remove();
      this.keyboardWillHideListener = null;
    }
    // Fallback in case remove() isn't available or fails
    // Note: Keyboard.removeAllListeners() might remove listeners added elsewhere
    // if (!this.keyboardWillShowListener && !this.keyboardWillHideListener) {
    //   try { Keyboard.removeAllListeners(); } catch (e) {}
    // }
  }


  private handleKeyboardShow = (info: KeyboardInfo) => {
    // Apply adjustment only if not iOS (native or web)
    // Capacitor returns platform 'web' for both Android/iOS web
    // but iOS web usually handles viewport resizing better automatically
    if (Capacitor.getPlatform() !== 'ios') {
      console.log('[BaseModal] Keyboard show event, platform:', Capacitor.getPlatform(), 'height:', info.keyboardHeight);
      this.setState({
        isKeyboardVisible: true,
        keyboardHeight: info.keyboardHeight
      });
    } else {
       console.log('[BaseModal] Keyboard show event on iOS, skipping manual adjustment.');
    }
  };

  private handleKeyboardHide = () => {
     // Apply adjustment only if not iOS (native or web)
    if (Capacitor.getPlatform() !== 'ios') {
       console.log('[BaseModal] Keyboard hide event, platform:', Capacitor.getPlatform());
      this.setState({
        isKeyboardVisible: false,
        keyboardHeight: 0
      });
     } else {
       console.log('[BaseModal] Keyboard hide event on iOS, skipping manual adjustment.');
     }
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

    // Determine the class for keyboard adjustment
    // Only add 'keyboard-visible' if the platform check passed in handlers
    const keyboardClass = isKeyboardVisible && Capacitor.getPlatform() !== 'ios' ? 'keyboard-visible' : '';

    return (
      <div
        className={`modal-overlay ${isActive ? 'active' : ''} ${className}`}
        onClick={this.handleClose}
      >
        <div
          className={`modal-content ${isActive ? 'active' : ''} ${keyboardClass} ${contentClassName}`}
          onClick={e => e.stopPropagation()}
          // Apply style only if needed (i.e., not iOS)
          style={keyboardClass ? { '--keyboard-height-px': `${keyboardHeight}px` } as React.CSSProperties : undefined}
        >
          {children}
        </div>
      </div>
    );
  }
}

export default BaseModal;