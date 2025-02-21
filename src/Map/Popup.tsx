import React from 'react';
import { User } from 'firebase/auth';
import { Sit, Image, MarkType } from '../types';
import Carousel from './Carousel';

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
  onClose?: () => void;
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

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyPress);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyPress);
  }

  private handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.props.onClose) {
      this.props.onClose();
    }
  };

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
    const showControls = user?.uid === sit.uploadedBy;

    return (
      <Carousel
        images={images}
        showControls={showControls}
        onImageAction={this.handleImageAction}
        isDeleting={this.state.isDeleting}
      />
    );
  }

  private renderMarkButtons() {
    const { marks } = this.props;
    const markTypes: { type: MarkType; icon: string; label: string }[] = [
      { type: 'favorite', icon: '★', label: 'Favorite' },
      { type: 'visited', icon: '✓', label: 'Visited' },
      { type: 'wantToGo', icon: '→', label: 'Want to Go' }
    ];

    return (
      <div className="mark-buttons">
        {markTypes.map(({ type, icon, label }) => (
          <button
            key={type}
            className={`mark-button ${type}${marks.has(type) ? ' active' : ''}`}
            onClick={(e) => this.handleMarkClick(e, type)}
          >
            {icon} {label}
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

  render() {
    const { user } = this.props;
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
      </div>
    );
  }
}

export default PopupComponent;