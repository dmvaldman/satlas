// Add Image type to existing types
export interface Image {
  id: string;
  photoURL: string;
  userId: string;
  userName: string;
  collectionId: string;
  createdAt: Date | any; // Using any for Firestore timestamp
}