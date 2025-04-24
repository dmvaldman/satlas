import React from 'react';
import { Sit, Image } from '../types';
import { FirebaseService } from '../services/FirebaseService';

interface GalleryViewProps {
  sits: Map<string, Sit>;
  onSelectSit: (sitId: string) => void;
}

interface GalleryViewState {
  firstImages: Map<string, Image | null>;
  isLoading: boolean;
}

class GalleryView extends React.Component<GalleryViewProps, GalleryViewState> {
  constructor(props: GalleryViewProps) {
    super(props);
    this.state = {
      firstImages: new Map(),
      isLoading: true,
    };
  }

  componentDidMount() {
    this.fetchFirstImages(this.props.sits);
  }

  componentDidUpdate(prevProps: GalleryViewProps) {
    if (prevProps.sits !== this.props.sits) {
      this.fetchFirstImages(this.props.sits);
    }
  }

  private async fetchFirstImages(sits: Map<string, Sit>) {
    if (sits.size === 0) {
        this.setState({ firstImages: new Map(), isLoading: false });
        return;
    }

    this.setState({ isLoading: true });
    const imagePromises: Promise<[string, Image | null]>[] = [];

    sits.forEach((sit, sitId) => {
      if (sit.imageCollectionId) {
        // Check if we already have the image (from previous fetch or temp data)
        if (!this.state.firstImages.has(sitId)) {
          imagePromises.push(
            FirebaseService.getFirstImageForSit(sit.imageCollectionId)
              .then(image => [sitId, image] as [string, Image | null])
          );
        }
      } else {
        // Handle sits without imageCollectionId immediately (null image)
        imagePromises.push(Promise.resolve([sitId, null]));
      }
    });

    try {
        const results = await Promise.all(imagePromises);
        const newImages = new Map(this.state.firstImages); // Start with existing images
        results.forEach(([sitId, image]) => {
            // Only update if the sit is still in the current props.sits
            if (this.props.sits.has(sitId)) {
                newImages.set(sitId, image);
            }
        });

        // Clean up images for sits no longer in props
        const currentSitIds = new Set(this.props.sits.keys());
        newImages.forEach((_, sitId) => {
            if (!currentSitIds.has(sitId)) {
                newImages.delete(sitId);
            }
        });


        this.setState({ firstImages: newImages, isLoading: false });
    } catch (error) {
        console.error("Error fetching first images for gallery:", error);
        this.setState({ isLoading: false }); // Stop loading even on error
    }
  }

  private handleSitClick = (sitId: string) => {
    this.props.onSelectSit(sitId);
  };

  render() {
    const { sits } = this.props;
    const { firstImages, isLoading } = this.state;

    // Filter out sits without imageCollectionId before rendering
    const sitsWithImages = Array.from(sits.values()).filter(sit => sit.imageCollectionId);

    return (
      <div className="gallery-view">
        {isLoading && (
          <div className="gallery-loading">
            <div className="spinner large"></div>
          </div>
        )}
        {!isLoading && sitsWithImages.length === 0 && (
          <p className="gallery-empty-message">No sits in this area. Try zooming out.</p>
        )}
        {!isLoading && sitsWithImages.length > 0 && (
          <div className="gallery-grid">
            {sitsWithImages.map((sit) => {
              const image = firstImages.get(sit.id);
              // Render only if we have successfully fetched an image URL
              if (image && image.photoURL) {
                return (
                  <div
                    key={sit.id}
                    className="gallery-item"
                    onClick={() => this.handleSitClick(sit.id)}
                  >
                    <img
                      src={image.photoURL ? `${image.photoURL}?size=med` : ''}
                      alt={`Sit ${sit.id}`}
                      className="gallery-image"
                      loading="lazy" // Use lazy loading for performance
                    />
                  </div>
                );
              }
              // Optionally render a placeholder if image is null or loading failed for this specific sit
              // else if (image === null) {
              //   return (
              //     <div key={sit.id} className="gallery-item placeholder">
              //       <span>No Image</span>
              //     </div>
              //   );
              // }
              return null; // Don't render if image fetch failed or no image exists
            })}
          </div>
        )}
      </div>
    );
  }
}

export default GalleryView;
