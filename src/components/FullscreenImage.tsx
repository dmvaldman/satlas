import React from 'react';
import { Image } from '../types';

interface FullscreenImageProps {
  isOpen: boolean;
  image: Image | null;
  onClose: () => void;
}

interface FullscreenImageState {
  isActive: boolean
}

class FullscreenImage extends React.Component<FullscreenImageProps, FullscreenImageState> {

  constructor(props: FullscreenImageProps) {
    super(props);
    this.state = {
      isActive: false
    };
  }

  componentDidUpdate(prevProps: FullscreenImageProps) {
    // When opening, set isActive to true after mount
    if (this.props.isOpen && !prevProps.isOpen) {
      requestAnimationFrame(() => {
        this.setState({ isActive: true });
      });
    }
    // When closing, set isActive to false before unmounting
    else if (!this.props.isOpen && prevProps.isOpen) {
      this.setState({ isActive: false });
    }
  }

  close = (e: React.MouseEvent) => {
    console.log('closed');
    e.stopPropagation();
    this.setState({ isActive: false });
    this.props.onClose();
  };

  render() {
    const { isOpen, image } = this.props;
    const { isActive } = this.state;

    if (!isOpen || !image) {
      return null;
    }

    // Determine the image source
    const imgSrc = image.base64Data
      ? `data:image/jpeg;base64,${image.base64Data.replace(/^data:image\/\w+;base64,/, '')}`
      : `${image.photoURL}?size=med`;

    return (
      <div className="fullscreen-image-overlay" onClick={this.close}>
        <button className="fullscreen-close-button" onClick={this.close}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
        <div className={`fullscreen-image-container ${isActive ? 'active' : ''}`}>
          <img
            src={imgSrc}
            alt={`Photo by ${image.userName}`}
            className="fullscreen-image"
          />
        </div>
      </div>
    );
  }
}

export default FullscreenImage;