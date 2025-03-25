import { User } from 'firebase/auth';

export interface Image {
  id: string;
  photoURL: string;
  userId: string;
  userName: string;
  collectionId: string;
  createdAt: Date;
  base64Data?: string;
  width: number;
  height: number;
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface Sit {
  id: string;
  location: Location;
  imageCollectionId: string;
  createdAt?: Date;
  uploadedBy?: string;
  uploadedByUsername?: string;
}

export interface ImageCollection {
  id: string;
  sitId: string;
}

export interface UserPreferences {
  username: string;
  pushNotificationsEnabled: boolean;
  lastVisit: number;
  cityCoordinates?: {
    latitude: number;
    longitude: number;
  };
}

export type MarkType = 'favorite' | 'wantToGo' | 'visited';

export interface PhotoResult {
  base64Data: string;
  location: Location;
  dimensions: {
    width: number;
    height: number;
  };
}

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: Date;
  lastUsed: Date;
}

export type { User }; // Use export type for re-exporting types