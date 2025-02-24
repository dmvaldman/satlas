import React from 'react';
import { User } from 'firebase/auth';
import { Sit, Image, MarkType } from '../types';
import Carousel from './Carousel';
import { getDistanceInFeet } from '../utils/geo';

interface PopupProps {
  sit: Sit;
  images: Image[];
  user: User | null;
  marks: Set<MarkType>;
  favoriteCount: number;
  onToggleMark: (sitId: string, type: MarkType) => Promise<void>;
  onDeleteImage: (sitId: string, imageId: string) => Promise<void>;
  onReplaceImage: (sitId: string, imageId: string) => void;
  onClose?: () => void;
  onOpenPhotoModal: (sit: Sit) => void;
  onOpenProfileModal: () => void;
  currentLocation: { latitude: number; longitude: number } | null;
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

    console.log('Before toggle:', this.props.marks);
    try {
      await onToggleMark(sit.id, type);
      console.log('After toggle:', this.props.marks);
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

    return (
      <Carousel
        images={images}
        currentUserId={user?.uid || null}
        onImageAction={this.handleImageAction}
        isDeleting={this.state.isDeleting}
      />
    );
  }

  private renderMarkButtons() {
    const { marks } = this.props;
    const markTypes: { type: MarkType; label: string }[] = [
      {
        type: 'favorite',
        label: 'Favorite'
      },
      {
        type: 'visited',
        label: 'Visited'
      },
      {
        type: 'wantToGo',
        label: 'Want to Go'
      }
    ];

    return (
      <div className="mark-buttons">
        {markTypes.map(({ type, label }) => (
          <button
            key={type}
            className={`mark-button ${type}${marks.has(type) ? ' active' : ''}`}
            onClick={(e) => this.handleMarkClick(e, type)}
          >
            <svg className="mark-icon" viewBox="0 0 24 24">
              {type === 'favorite' && (
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              )}
              {type === 'visited' && (
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              )}
              {type === 'wantToGo' && (
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
              )}
            </svg>
            {label}
          </button>
        ))}
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

  private renderUploadButton() {
    const { sit, user, currentLocation } = this.props;

    if (!currentLocation) return null;

    const distance = getDistanceInFeet(currentLocation, sit.location);
    if (distance > 300) return null; // Only show if within 300 feet

    const handleClick = async () => {
      if (!user) {
        this.props.onOpenProfileModal();
        return;
      }
      if (!sit.imageCollectionId) return;
      this.props.onOpenPhotoModal(sit);
    };

    return (
      <button
        className="photo-option-button"
        onClick={handleClick}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
          <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
        </svg>
        {user ? 'Upload Photo' : 'Sign in to Upload Photo'}
      </button>
    );
  }

  render() {
    const { sit, user, images } = this.props;
    const { error } = this.state;

    return (
      <div className="satlas-popup">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {sit.imageCollectionId ? (
          this.renderCarousel()
        ) : (
          <div className="pending-upload">
            <p>Uploading new sit...</p>
          </div>
        )}

        {this.renderUploadButton()}

        {/* Only show mark buttons if the sit is fully created */}
        {sit.imageCollectionId && user && this.renderMarkButtons()}

        {/* Only show favorite count for established sits */}
        {sit.imageCollectionId && this.renderFavoriteCount()}

        {/* Show appropriate status message */}
        <div className="sit-info">
          {sit.uploadedBy && (
            <p className="sit-author">
              Added by {sit.uploadedBy === user?.uid ? 'you' : 'another user'}
            </p>
          )}
          {!sit.imageCollectionId && (
            <p className="sit-status">Processing upload...</p>
          )}
        </div>
      </div>
    );
  }
}

export default PopupComponent;