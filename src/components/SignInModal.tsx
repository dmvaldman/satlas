import React from 'react';
import { FirebaseService } from '../services/FirebaseService';
import { User } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth } from '../services/FirebaseService';

interface SignInModalProps {
  isOpen: boolean;
  message?: string;
  onClose: () => void;
  onSignInSuccess: (user: User) => Promise<void>;
  onSignInError: () => void;
}

interface SignInModalState {
  isActive: boolean;
}

class SignInModal extends React.Component<SignInModalProps, SignInModalState> {
  constructor(props: SignInModalProps) {
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

  componentDidUpdate(prevProps: SignInModalProps) {
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

  private handleSignIn = async (method: 'apple' | 'google') => {
    // Close modal immediately for better UX
    this.props.onClose();

    try {
      const signInMethod = method === 'apple' ?
        FirebaseService.signInWithApple :
        FirebaseService.signInWithGoogle;

      await signInMethod();

      const currentUser = auth.currentUser;
      if (currentUser) {
        // Handle success in the background
        this.props.onSignInSuccess(currentUser).catch(() => {
          this.props.onSignInError();
        });
      } else {
        this.props.onSignInError();
      }
    } catch (error) {
      console.error('[SignInModal] Sign-in error:', error);
      // Check if error is a user cancellation
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('cancel') ||
            errorMessage.includes('popup-closed') ||
            errorMessage.includes('popup-blocked')) {
          console.log('[SignInModal] Sign-in cancelled by user');
          return;
        }
      }
      this.props.onSignInError();
    }
  };

  private handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    this.props.onClose();
  };

  render() {
    const { isOpen, message } = this.props;
    const { isActive } = this.state;

    if (!isOpen) return null;

    return (
      <div
        className={`modal-overlay ${isOpen ? 'active' : ''}`}
        style={{ display: isOpen ? 'flex' : 'none' }}
        onClick={(e) => this.handleClose(e)}
      >
        <div
          className={`modal-content ${isActive ? 'active' : ''}`}
          onClick={e => e.stopPropagation()}
        >
          {message && (
            <h2>
              {message}
            </h2>
          )}

          <div className="sign-in-buttons">
            {/* {Capacitor.getPlatform() === 'ios' && ( */}
              <button
                className="modal-option-button"
                onClick={() => this.handleSignIn('apple')}
              >
                <svg className="apple-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.41-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.05 2.31-.75 3.57-.84 1.51-.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.65 1.48-1.46 2.83-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Sign in with Apple
              </button>
            {/* )} */}

            <button
              className="modal-option-button"
              onClick={() => this.handleSignIn('google')}
            >
              <svg className="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default SignInModal;