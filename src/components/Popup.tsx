import React from 'react';
import Carousel from './Carousel';
import { User } from 'firebase/auth';
import { Sit, Image, MarkType, Location } from '../types';
import { getDistanceInFeet } from '../utils/geo';
import { formatRelativeTime } from '../utils/dateUtils';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { FirebaseService } from '../services/FirebaseService';
import BottomSheet from './BottomSheet';

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

interface PopupProps {
  isOpen: boolean;
  photoModalIsOpen: boolean;
  user: User | null;
  sit?: Sit;
  images?: Image[];
  marks?: Set<MarkType>;
  favoriteCount?: number;
  currentLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onToggleMark: (sitId: string, type: MarkType) => Promise<void>;
  onDeleteImage: (sitId: string, imageId: string) => Promise<void>;
  onReplaceImage: (sitId: string, imageId: string) => void;
  onOpenPhotoModal: (sit: Sit) => void;
  onOpenProfileModal: () => void;
  onSignIn?: () => Promise<void>;
  onOpenFullscreenImage: (image: Image) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

class PopupComponent extends React.Component<PopupProps> {
  constructor(props: PopupProps) {
    super(props);
  }

  componentDidUpdate(prevProps: PopupProps) {
    const { sit, user, isOpen } = this.props;

    // Mark the sit as seen when the popup is opened
    if (isOpen && !prevProps.isOpen && sit && user) {
      FirebaseService.markSitAsSeen(user.uid, sit.id);
    }
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

    if (!sit) {
      console.error('sit is undefined');
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

  private handleImageDelete = async (imageId: string) => {
    const { sit, onDeleteImage } = this.props;
    if (!window.confirm('Are you sure you want to delete this photo?')) {
      return;
    }
    if (!sit) {
      console.error('sit is undefined');
      return;
    }
    await onDeleteImage(sit.id, imageId);
  };

  private handleImageReplace = async (imageId: string) => {
    const { sit, onReplaceImage } = this.props;
    if (!sit) {
      console.error('sit is undefined');
      return;
    }
    onReplaceImage(sit.id, imageId);
  };

  private handleShareSit = async () => {
    const { sit } = this.props;
    if (!sit) return;

    // Create both app deep link and web fallback URL
    const webFallbackUrl = `http://localhost:5173?sitId=${sit.id}`;

    // On mobile, use the Share API
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: 'Check out this place to sit.',
          text: 'I found an interesting place to sit.',
          url: webFallbackUrl,
          dialogTitle: 'Share this sit'
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // For web, copy to clipboard or use Web Share API if available
      navigator.clipboard.writeText(webFallbackUrl);
      this.props.showNotification('Link copied to clipboard', 'success');
    }
  };

  private getIconPath(type: MarkType): string {
    switch (type) {
      case 'favorite':
        return 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
      case 'visited':
        return 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z';
      case 'wantToGo':
        return 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z';
      default:
        return '';
    }
  }

  private renderCarousel() {
    const { images, user } = this.props;

    if (!images) {
      console.error('images is undefined');
      return;
    }

    return (
      <Carousel
        images={images}
        currentUserId={user?.uid || null}
        onImageDelete={this.handleImageDelete}
        onImageReplace={this.handleImageReplace}
        onOpenFullscreenImage={this.props.onOpenFullscreenImage}
      />
    );
  }

  private renderMarkButtons() {
    const { marks } = this.props;

    return (
      <div className="mark-buttons">
        {markTypes.map(({ type, label }) => (
          <button
            key={type}
            className={`mark-button ${type}${marks && marks.has(type) ? ' active' : ''}`}
            onClick={(e) => this.handleMarkClick(e, type)}
          >
            <svg className="mark-icon" viewBox="0 0 24 24">
              <path
                d={this.getIconPath(type)}
              />
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
    if (!sit) return null;

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

    // Don't show if user is not logged in or no location available or if sit is undefined
    if (!user || !currentLocation || !sit) return null;

    // Don't show if user is too far away (more than 300 feet)
    const distance = getDistanceInFeet(currentLocation, sit.location);
    if (distance > 300) return null;

    // Don't show if user has already contributed an image to this sit
    const hasUserUploadedImage = images && images.some(image => image.userId === user.uid);
    if (hasUserUploadedImage) return null;

    const handleClick = async () => {
      if (!user) {
        this.props.onOpenProfileModal();
        return;
      }
      if (!sit) {
        console.error('sit is undefined');
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

  private renderShareButton() {
    // Only show share button on web platforms
    if (Capacitor.isNativePlatform()) {
      return null;
    }

    return (
      <button className="share-button" onClick={this.handleShareSit}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92zM18 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 13c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 7.02c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
        </svg>
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

    if (!sit) {
      return null;
    }

    // Render our custom BottomSheet component instead of react-spring-bottom-sheet
    return (
      <BottomSheet
        open={isOpen && !photoModalIsOpen}
        onClose={onClose}
        header={
          <div className="bottom-sheet-header">
            <svg className="popup-icon" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet">
              <g transform="translate(0,512) scale(0.1,-0.1)">
                <path d="M927 3682 c-15 -16 -17 -50 -17 -270 l0 -251 -247 -127 c-387 -199 -397 -205 -401 -237 -4 -36 45 -126 74 -133 13 -3 42 5 72 20 28 14 56 26 62 26 7 0 10 -205 10 -635 0 -725 -11 -655 98 -655 92 0 92 -1 92 238 l0 202 120 0 120 0 0 -198 c0 -241 0 -242 94 -242 103 0 100 -6 104 234 l3 206 1450 0 1449 0 0 -200 c0 -241 0 -240 104 -240 96 0 96 0 96 242 l0 198 120 0 120 0 0 -203 c0 -240 -1 -237 98 -237 42 0 65 5 76 16 14 14 16 86 16 645 0 426 3 629 10 629 6 0 34 -12 62 -26 30 -15 59 -23 72 -20 29 7 78 97 74 133 -4 32 -14 38 -400 237 l-248 127 0 247 c0 300 3 292 -100 292 -60 0 -71 -3 -84 -22 -9 -12 -16 -35 -16 -50 l0 -28 -1449 0 -1448 0 -6 36 c-9 56 -21 64 -97 64 -52 0 -71 -4 -83 -18z m273 -757 l0 -435 -45 0 -45 0 0 435 0 435 45 0 45 0 0 -435z m320 0 l0 -435 -60 0 -60 0 0 435 0 435 60 0 60 0 0 -435z m310 0 l0 -435 -60 0 -60 0 0 435 0 435 60 0 60 0 0 -435z m320 0 l0 -435 -60 0 -60 0 0 435 0 435 60 0 60 0 0 -435z m310 0 l0 -435 -60 0 -60 0 0 435 0 435 60 0 60 0 0 -435z m320 0 l0 -435 -60 0 -60 0 0 435 0 435 60 0 60 0 0 -435z m310 0 l0 -435 -60 0 -60 0 0 435 0 435 60 0 60 0 0 -435z m320 0 l0 -435 -60 0 -60 0 0 435 0 435 60 0 60 0 0 -435z m310 0 l0 -435 -60 0 -60 0 0 435 0 435 60 0 60 0 0 -435z m290 0 l0 -435 -45 0 -45 0 0 435 0 435 45 0 45 0 0 -435z m-3100 -210 l0 -225 -120 0 -120 0 0 164 0 164 113 61 c61 33 115 60 120 60 4 1 7 -100 7 -224z m3425 164 l115 -61 0 -164 0 -164 -120 0 -120 0 0 225 c0 124 2 225 5 225 3 0 57 -27 120 -61z m115 -774 l0 -25 -1890 0 -1890 0 0 25 0 25 1890 0 1890 0 0 -25z"/>
              </g>
            </svg>
            {this.renderShareButton()}
          </div>
        }
      >
        <div className="satlas-popup">
          {sit.imageCollectionId || (images && images.some(img => img.base64Data)) ? (
            this.renderCarousel()
          ) : (
            <p>Uploading new sit...</p>
          )}

          {this.renderUploadButton()}

          {this.renderMarkButtons()}

          {/* Group metadata elements in a single div */}
          <div className="sit-metadata-container">
            {/* Display uploader information */}
            {sit.uploadedBy && sit.createdAt && (
              <div className="sit-uploader-info">
                Sit found {sit.uploadedByUsername ? 'by ' + sit.uploadedByUsername : ''} {formatRelativeTime(sit.createdAt)}
              </div>
            )}

            {/* Only show favorite count for established sits */}
            {this.renderFavoriteCount()}

            {/* Show Google Maps link */}
            {this.renderGoogleMapsLink()}
          </div>

        </div>
      </BottomSheet>
    );
  }
}

export default PopupComponent;