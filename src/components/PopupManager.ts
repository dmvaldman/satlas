import mapboxgl from 'mapbox-gl';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { Sit, Image, MarkType, User } from '../types';
import PopupComponent from './Popup';

export class PopupManager {
  private activePopup: mapboxgl.Popup | null = null;
  private popupRoot: Root | null = null;
  private popupContainer: HTMLElement | null = null;
  private currentSitId: string | null = null;
  private currentImages: Image[] = [];

  constructor(
    private onToggleMark: (sitId: string, type: MarkType) => Promise<void>,
    private onDeleteImage: (sitId: string, imageId: string) => Promise<void>,
    private onReplaceImage: (sitId: string, imageId: string) => void,
    private onOpenPhotoModal: (sit: Sit) => void,
    private onOpenProfileModal: () => void,
    private getImagesForSit: (imageCollectionId: string) => Promise<Image[]>,
    private onOpenFullScreenCarousel: (images: Image[], initialIndex: number) => void
  ) {}

  public async showPopup(
    map: mapboxgl.Map,
    sit: Sit,
    user: User | null,
    marks: Set<MarkType>,
    favoriteCount: number,
    currentLocation: { latitude: number; longitude: number } | null
  ): Promise<void> {
    if (this.activePopup) {
      this.activePopup.remove();
    }

    const container = document.createElement('div');
    this.popupContainer = container;
    this.popupRoot = createRoot(container);
    this.currentSitId = sit.id;

    try {
      const images = sit.imageCollectionId
        ? await this.getImagesForSit(sit.imageCollectionId)
        : [];
      this.currentImages = images;

      this.popupRoot.render(
        React.createElement(PopupComponent, {
          sit,
          images,
          user,
          marks,
          favoriteCount,
          currentLocation,
          onToggleMark: this.onToggleMark,
          onDeleteImage: this.onDeleteImage,
          onReplaceImage: this.onReplaceImage,
          onOpenPhotoModal: () => this.onOpenPhotoModal(sit),
          onOpenProfileModal: this.onOpenProfileModal,
          onImageClick: (index) => this.onOpenFullScreenCarousel(images, index)
        })
      );

      const popup = new mapboxgl.Popup({
        closeButton: false,
        offset: 10,
        className: 'satlas-popup-container'
      });

      popup.setDOMContent(container)
           .setLngLat([sit.location.longitude, sit.location.latitude])
           .addTo(map);

      popup.on('close', () => {
        this.cleanupPopup();
      });

      this.activePopup = popup;
    } catch (error) {
      console.error('Error loading popup content:', error);
    }
  }

  public updatePopup(
    sit: Sit,
    user: User | null,
    marks: Set<MarkType>,
    favoriteCount: number,
    currentLocation: { latitude: number; longitude: number } | null
  ): void {
    if (this.popupRoot && this.currentSitId === sit.id) {
      this.popupRoot.render(
        React.createElement(PopupComponent, {
          sit,
          images: this.currentImages,
          user,
          marks,
          favoriteCount,
          onToggleMark: this.onToggleMark,
          onDeleteImage: this.onDeleteImage,
          onReplaceImage: this.onReplaceImage,
          onOpenPhotoModal: () => this.onOpenPhotoModal(sit),
          onOpenProfileModal: this.onOpenProfileModal,
          currentLocation
        })
      );
    }
  }

  public closePopup(): void {
    if (this.activePopup) {
      this.activePopup.remove();
    }
  }

  private cleanupPopup(): void {
    if (this.popupRoot) {
      this.popupRoot.unmount();
      this.popupRoot = null;
    }

    this.popupContainer = null;
    this.currentSitId = null;
    this.currentImages = [];
    this.activePopup = null;
  }

  public getCurrentSitId(): string | null {
    return this.currentSitId;
  }
}