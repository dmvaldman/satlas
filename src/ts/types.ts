import { FieldValue } from 'firebase/firestore';

export interface Sit {
  id: string;
  location: {
    latitude: number;
    longitude: number;
  };
  photoURL: string;
  userId: string;
  userName: string;
  createdAt: Date | FieldValue;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}