import { FieldValue, Timestamp } from 'firebase/firestore';

export interface Sit {
  id: string;
  location: {
    latitude: number;
    longitude: number;
  };
  imageCollectionId: string;  // Reference to ImageCollection
  createdAt: Date | FieldValue;
}

export interface ImageCollection {
  id: string;
  sitId: string;  // Back reference to Sit
}

export interface SitImage {
  id: string;
  collectionId: string;  // Reference to ImageCollection
  photoURL: string;
  userId: string;
  userName: string;
  createdAt: Date | FieldValue;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface UserPreferences {
  nickname: string;
  pushNotificationsEnabled: boolean;
  lastVisit: number;  // Unix timestamp
}

export type MarkType = 'favorite' | 'wantToGo' | 'visited';

export interface UserSitMark {
  userId: string;
  sitId: string;
  type: MarkType;
  createdAt: Timestamp;
}

// Helper function to calculate distance between coordinates
export function getDistanceInFeet(coord1: Coordinates, coord2: Coordinates): number {
  const R = 20902231; // Earth radius in feet
  const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}