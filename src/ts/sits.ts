import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, getDoc, deleteDoc } from 'firebase/firestore';
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

    // Upload image to storage
    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);
    const base64WithoutPrefix = strippedImage.replace(/^data:image\/\w+;base64,/, '');
    await uploadString(storageRef, base64WithoutPrefix, 'base64');
    const photoURL = await getDownloadURL(storageRef);

    // Generate imageCollectionId
    const imageCollectionId = `${Date.now()}_${userId}`;

    // Create sit data
    const sitData = {
      location: coordinates,
      imageCollectionId,
      uploadedBy: userId,
      createdAt: serverTimestamp()
    };

    // Add sit to Firestore
    const docRef = await addDoc(collection(db, 'sits'), sitData);
    const sit = { ...sitData, id: docRef.id } as Sit;

    // Add image to images collection
    await this.addImageToSit(imageCollectionId, {
      photoURL,
      userId,
      userName,
      createdAt: serverTimestamp()
    });

    return sit;
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

  async getSit(sitId: string): Promise<Sit | null> {
    const sitDoc = await getDoc(doc(db, 'sits', sitId));
    if (sitDoc.exists()) {
      return { ...sitDoc.data(), id: sitDoc.id } as Sit;
    }
    return null;
  }

  async replaceImage(sitId: string, imageId: string, newPhotoURL: string): Promise<void> {
    const imageRef = doc(db, 'images', imageId);
    await updateDoc(imageRef, { photoURL: newPhotoURL });
  }

  async deleteImage(sitId: string, imageId: string): Promise<void> {
    const imageRef = doc(db, 'images', imageId);
    await deleteDoc(imageRef);

    // Get remaining images for this sit
    const sit = await this.getSit(sitId);
    if (!sit) return;

    const remainingImages = await this.getImagesForSit(sit.imageCollectionId);

    // If this was the last image, delete the entire sit
    if (remainingImages.length === 0) {
      const sitRef = doc(db, 'sits', sitId);
      await deleteDoc(sitRef);
    }
  }

  async getImagesForSit(imageCollectionId: string): Promise<Image[]> {
    if (!imageCollectionId) {
      console.warn('No imageCollectionId provided to getImagesForSit');
      return [];
    }

    const imagesRef = collection(db, 'images');
    const q = query(imagesRef, where('collectionId', '==', imageCollectionId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Image));
  }

  async addImageToSit(imageCollectionId: string, imageData: Partial<Image>): Promise<void> {
    const imageRef = collection(db, 'images');
    await addDoc(imageRef, {
      ...imageData,
      collectionId: imageCollectionId,
      createdAt: serverTimestamp()
    });
  }
}

export const sitManager = new SitManager();