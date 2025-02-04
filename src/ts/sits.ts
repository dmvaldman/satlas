import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { Sit, Coordinates } from './types';
import { getDistanceInFeet } from './types';

export class SitManager {
  async loadNearbySits(bounds: { north: number; south: number }): Promise<Sit[]> {
    const sitsRef = collection(db, 'sits');
    const q = query(
      sitsRef,
      where('location.latitude', '>=', bounds.south),
      where('location.latitude', '<=', bounds.north)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Sit));
  }

  async uploadSit(
    base64Image: string,
    coordinates: Coordinates,
    userId: string,
    userName: string
  ): Promise<Sit> {
    // Strip EXIF data from image
    const strippedImage = await this.stripExif(base64Image);

    // Upload image
    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);
    const base64WithoutPrefix = strippedImage.replace(/^data:image\/\w+;base64,/, '');
    await uploadString(storageRef, base64WithoutPrefix, 'base64');
    const photoURL = await getDownloadURL(storageRef);

    // Create sit data with timestamp as number
    const sitData = {
      location: coordinates,
      images: [{
        id: `${Date.now()}_${userId}`,
        photoURL,
        userId,
        userName,
        createdAt: Date.now() // Use numeric timestamp instead of serverTimestamp
      }],
      createdAt: serverTimestamp() // Keep serverTimestamp for the document's creation
    };

    // Add to Firestore
    const docRef = await addDoc(collection(db, 'sits'), sitData);
    return { ...sitData, id: docRef.id } as Sit;
  }

  private async stripExif(base64Image: string): Promise<string> {
    // Implementation of EXIF stripping logic
    return base64Image;
  }

  async findNearbySit(coordinates: Coordinates): Promise<Sit | null> {
    const sitsRef = collection(db, 'sits');
    const querySnapshot = await getDocs(sitsRef);

    for (const doc of querySnapshot.docs) {
      const sit = { ...doc.data(), id: doc.id } as Sit;
      if (getDistanceInFeet(coordinates, sit.location) < 100) {
        return sit;
      }
    }

    return null;
  }

  async addImageToSit(sitId: string, imageData: {
    photoURL: string;
    userId: string;
    userName: string;
  }): Promise<void> {
    const sitRef = doc(db, 'sits', sitId);
    await updateDoc(sitRef, {
      images: arrayUnion({
        id: `${Date.now()}_${imageData.userId}`,
        ...imageData,
        createdAt: Date.now() // Use numeric timestamp instead of serverTimestamp
      })
    });
  }

  async getSit(sitId: string): Promise<Sit | null> {
    const sitDoc = await getDoc(doc(db, 'sits', sitId));
    if (sitDoc.exists()) {
      return { ...sitDoc.data(), id: sitDoc.id } as Sit;
    }
    return null;
  }
}