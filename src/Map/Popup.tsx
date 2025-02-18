import React from 'react';
import { User } from 'firebase/auth';
import { Sit, Image, MarkType } from '../types';

interface PopupProps {
  sit: Sit;
  images: Image[];
  currentLocation: { latitude: number; longitude: number };
  user: User | null;
  marks: Set<MarkType>;
  favoriteCount: number;
  onToggleMark: (sitId: string, type: MarkType) => Promise<void>;
  onDeleteImage: (sitId: string, imageId: string) => Promise<void>;
  onReplaceImage: (sitId: string, imageId: string) => void;
}

interface PopupState {
  activeImageIndex: number;
  isDeleting: boolean;
  error: string | null;
}

class PopupComponent extends React.Component<PopupProps, PopupState> {
  constructor(props: PopupProps) {
    super(props);
    this.state = {
      activeImageIndex: 0,
      isDeleting: false,
      error: null
    };
  }

  private handleMarkClick = async (e: React.MouseEvent, type: MarkType) => {
    e.stopPropagation();
    const { sit, onToggleMark } = this.props;

    try {
      await onToggleMark(sit.id, type);
    } catch (error) {
      this.setState({ error: 'Failed to update mark' });
    }
  };

  private handleImageAction = async (action: 'replace' | 'delete', imageId: string) => {
    const { sit, onDeleteImage, onReplaceImage } = this.props;

    if (action === 'delete') {
      if (!window.confirm('Are you sure you want to delete this photo?')) {
        return;
      }

      this.setState({ isDeleting: true, error: null });
      try {
        await onDeleteImage(sit.id, imageId);
      } catch (error) {
        this.setState({ error: 'Failed to delete image' });
      } finally {
        this.setState({ isDeleting: false });
      }
    } else if (action === 'replace') {
      onReplaceImage(sit.id, imageId);
    }
  };

  private renderCarousel() {
    const { images, user, sit } = this.props;
    const { activeImageIndex } = this.state;

    if (images.length === 0) {
      return <div className="no-images">No images available</div>;
    }

    const currentImage = images[activeImageIndex];
    const showControls = user?.uid === sit.uploadedBy;

    return (
      <div className="carousel">
        <img
          src={currentImage.photoURL}
          alt={`Sit ${activeImageIndex + 1}`}
          className="carousel-image"
        />

        {images.length > 1 && (
          <div className="carousel-controls">
            <button
              onClick={() => this.setState(prev => ({
                activeImageIndex: prev.activeImageIndex === 0
                  ? images.length - 1
                  : prev.activeImageIndex - 1
              }))}
              className="carousel-button prev"
            >
              ←
            </button>
            <button
              onClick={() => this.setState(prev => ({
                activeImageIndex: prev.activeImageIndex === images.length - 1
                  ? 0
                  : prev.activeImageIndex + 1
              }))}
              className="carousel-button next"
            >
              →
            </button>
          </div>
        )}

        {showControls && (
          <div className="image-controls">
            <button
              onClick={() => this.handleImageAction('replace', currentImage.id)}
              disabled={this.state.isDeleting}
            >
              Replace
            </button>
            <button
              onClick={() => this.handleImageAction('delete', currentImage.id)}
              disabled={this.state.isDeleting}
            >
              {this.state.isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    );
  }

  private renderMarkButtons() {
    const { marks } = this.props;

    return (
      <div className="mark-buttons">
        <button
          className={`mark-button favorite ${marks.has('favorite') ? 'active' : ''}`}
          onClick={(e) => this.handleMarkClick(e, 'favorite')}
        >
          ★ Favorite
        </button>
        <button
          className={`mark-button visited ${marks.has('visited') ? 'active' : ''}`}
          onClick={(e) => this.handleMarkClick(e, 'visited')}
        >
          ✓ Visited
        </button>
        <button
          className={`mark-button want-to-go ${marks.has('wantToGo') ? 'active' : ''}`}
          onClick={(e) => this.handleMarkClick(e, 'wantToGo')}
        >
          → Want to Go
        </button>
      </div>
    );
  }

  private renderFavoriteCount() {
    const { favoriteCount } = this.props;
    if (favoriteCount === 0) return null;

    return (
      <div className="favorite-count">
        {favoriteCount} {favoriteCount === 1 ? 'person' : 'people'} favorited this
      </div>
    );
  }

  render() {
    const { sit, user } = this.props;
    const { error } = this.state;

    return (
      <div className="satlas-popup">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {this.renderCarousel()}

        {user && this.renderMarkButtons()}

        {this.renderFavoriteCount()}

        <div className="sit-info">
          <p className="sit-description">{sit.description}</p>
          <p className="sit-author">Added by {sit.userName}</p>
        </div>
      </div>
    );
  }
}

export default PopupComponent;