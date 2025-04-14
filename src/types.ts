import { User } from 'firebase/auth';

export type MarkType = 'favorite' | 'wantToGo' | 'visited';
export type PhotoModalState = 'add_image' | 'create_sit' | 'replace_image' | 'none';

export interface Image {
  id: string;
  photoURL: string;
  userId: string;
  userName: string;
  collectionId: string;
  createdAt: Date;
  width: number;
  height: number;
  base64Data?: string;
  location?: Location;
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface Sit {
  id: string;
  location: Location;
  imageCollectionId: string;
  createdAt: Date;
  uploadedBy: string;
  uploadedByUsername: string;
}

export interface ImageCollection {
  id: string;
  sitId: string;
}

export interface UserPreferences {
  username: string;
  username_lowercase: string;
  pushNotificationsEnabled: boolean;
  lastVisit: number;
  cityCoordinates?: {
    latitude: number;
    longitude: number;
  };
}

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