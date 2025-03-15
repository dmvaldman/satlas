import React from 'react';
import { User } from 'firebase/auth';
import { Sit, Image, MarkType } from '../types';
import Carousel from './Carousel';
import { getDistanceInFeet } from '../utils/geo';
import { formatRelativeTime } from '../utils/dateUtils';
import { BottomSheet } from 'react-spring-bottom-sheet';
import 'react-spring-bottom-sheet/dist/style.css';

interface PopupProps {
  isOpen: boolean;
  photoModalIsOpen: boolean;
  sit: Sit;
  images: Image[];
  user: User | null;
  marks: Set<MarkType>;
  favoriteCount: number;
  currentLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onToggleMark: (sitId: string, type: MarkType) => Promise<void>;
  onDeleteImage: (sitId: string, imageId: string) => Promise<void>;
  onReplaceImage: (sitId: string, imageId: string) => void;
  onOpenPhotoModal: (sit: Sit) => void;
  onOpenProfileModal: () => void;
  onSignIn?: () => Promise<void>;
}

interface PopupState {}

class PopupComponent extends React.Component<PopupProps, PopupState> {
  constructor(props: PopupProps) {
    super(props);
  }

  private handleMarkClick = async (e: React.MouseEvent, type: MarkType) => {
    e.stopPropagation();
    const { sit, onToggleMark, user, onSignIn } = this.props;

    // If user is not authenticated and we have a sign-in handler, trigger sign-in
    if (!user && onSignIn) {
      try {
        await onSignIn();
        // After sign-in, the component will re-render with the user prop
        // We don't need to toggle the mark here as the user might not be set immediately
      } catch (error) {
        console.error('Error signing in:', error);
      }
      return;
    }

    // Only proceed with toggling mark if user is authenticated
    if (user) {
      console.log('Before toggle:', this.props.marks);
      try {
        await onToggleMark(sit.id, type);
        console.log('After toggle:', this.props.marks);
      } catch (error) {
        console.error('Error toggling mark:', error);
      }
    }
  };


  private handleImageAction = async (action: 'replace' | 'delete', imageId: string) => {
    const { sit, onDeleteImage, onReplaceImage } = this.props;

    if (action === 'delete') {
      if (!window.confirm('Are you sure you want to delete this photo?')) {
        return;
      }

      try {
        await onDeleteImage(sit.id, imageId);
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    } else if (action === 'replace') {
      onReplaceImage(sit.id, imageId);
    }
  };

  private renderCarousel() {
    const { images, user, sit, isOpen } = this.props;

    // Add a key that combines the sit ID and the number of images
    // This ensures a new instance is created when the drawer is reopened or images change
    return (
      <Carousel
        key={`carousel-${sit.id}-${images.length}-${isOpen ? 'open' : 'closed'}`}
        images={images}
        currentUserId={user?.uid || null}
        onImageAction={this.handleImageAction}
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

  private renderGoogleMapsLink() {
    const { sit } = this.props;
    // Use geo: URI scheme which will open default maps app
    const mapsUrl = `geo:${sit.location.latitude},${sit.location.longitude}`;
    // Fallback to Google Maps on desktop
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${sit.location.latitude},${sit.location.longitude}`;

    return (
      <a
        href={mapsUrl}
        onClick={(e) => {
          // If geo: URI fails, fall back to Google Maps
          if (!navigator.userAgent.match(/iPhone|iPad|iPod|Android/i)) {
            e.preventDefault();
            window.open(googleMapsUrl, '_blank');
          }
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="maps-link"
      >
        open in maps
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px', verticalAlign: 'middle' }}>
          <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
        </svg>
      </a>
    );
  }

  private renderUploadButton() {
    const { sit, user, currentLocation, images } = this.props;

    // The "Upload Photo" button is only shown when ALL of these conditions are met:
    // 1. User is authenticated (logged in)
    // 2. User's current location is available
    // 3. User is within 300 feet of the sit
    // 4. User has NOT already uploaded an image to this sit

    // Don't show if user is not logged in or no location available
    if (!user || !currentLocation) return null;

    // Don't show if user is too far away (more than 300 feet)
    const distance = getDistanceInFeet(currentLocation, sit.location);
    if (distance > 300) return null;

    // Don't show if user has already contributed an image to this sit
    const hasUserUploadedImage = images.some(image => image.userId === user.uid);
    if (hasUserUploadedImage) return null;

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
        Upload Photo
      </button>
    );
  }

  render() {
    const {
      sit,
      isOpen,
      photoModalIsOpen,
      onClose,
      images
    } = this.props;

    // Render the BottomSheet that wraps our popup content
    return (
      <>
        {sit && (
          <BottomSheet
            open={isOpen && !photoModalIsOpen}
            onDismiss={onClose}
            snapPoints={({ minHeight }) => [
              minHeight,
              Math.min(700, window.innerHeight * 0.8)
            ]}
            expandOnContentDrag={false}
            defaultSnap={({ minHeight }) => minHeight}
            header={
              <div className="bottom-sheet-header">
                <span className="header-emoji">🪑</span>
              </div>
            }
          >
            <div className="satlas-popup">
              {/* Show carousel if there are images (even for pending uploads with base64 data) */}
              {(sit.imageCollectionId || images.some(img => img.base64Data)) ? (
                this.renderCarousel()
              ) : (
                <div className="pending-upload">
                  <p>Uploading new sit...</p>
                </div>
              )}

              {this.renderUploadButton()}

              {this.renderMarkButtons()}

              {/* Group metadata elements in a single div */}
              <div className="sit-metadata-container">
                {/* Display uploader information */}
                {sit.uploadedBy && sit.createdAt && (
                  <div className="sit-uploader-info">
                    Sit uploaded {formatRelativeTime(sit.createdAt)}
                  </div>
                )}

                {/* Only show favorite count for established sits */}
                {this.renderFavoriteCount()}

                {/* Show Google Maps link */}
                {this.renderGoogleMapsLink()}
              </div>
            </div>
          </BottomSheet>
        )}
      </>
    );
  }
}

export default PopupComponent;