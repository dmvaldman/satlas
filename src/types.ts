import { User } from 'firebase/auth';

export interface Image {
  id: string;
  photoURL: string;
  userId: string;
  userName: string;
  collectionId: string;
  createdAt: Date;
  base64Data?: string;
  width?: number;  // Image width in pixels
  height?: number; // Image height in pixels
}

export interface Sit {
  id: string;
  location: {
    latitude: number;
    longitude: number;
  };
  imageCollectionId?: string;
  createdAt?: Date;
  uploadedBy?: string;
}

export interface ImageCollection {
  id: string;
  sitId: string;  // Back reference to Sit
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface UserPreferences {
  username: string;
  pushNotificationsEnabled: boolean;
  lastVisit?: number;  // Making lastVisit optional since it's not used in the profile modal
}

export type MarkType = 'favorite' | 'wantToGo' | 'visited';

export interface PhotoResult {
  base64Data: string;
  location: Coordinates;
  dimensions?: {
    width: number;
    height: number;
  };
}

export type { User }; // Use export type for re-exporting types