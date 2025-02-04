import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { Sit, Coordinates } from './types';

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

    // Create sit data
    const sitData = {
      location: coordinates,
      photoURL,
      userId,
      userName,
      createdAt: serverTimestamp()
    };

    // Add to Firestore
    const docRef = await addDoc(collection(db, 'sits'), sitData);
    return { ...sitData, id: docRef.id } as Sit;
  }

  private async stripExif(base64Image: string): Promise<string> {
    // Implementation of EXIF stripping logic
    return base64Image;
  }
}