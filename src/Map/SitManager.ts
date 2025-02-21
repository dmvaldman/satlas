import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Sit, Image } from '../types';

export class SitManager {
  // Load sits within map bounds
  static async loadNearbySits(bounds: { north: number; south: number }): Promise<Map<string, Sit>> {
    const sitsRef = collection(db, 'sits');
    const q = query(
      sitsRef,
      where('location.latitude', '>=', bounds.south),
      where('location.latitude', '<=', bounds.north)
    );

    const querySnapshot = await getDocs(q);
    console.log('Found sits:', querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })));

    const sits = new Map<string, Sit>();

    querySnapshot.docs.forEach(doc => {
      const sitData = doc.data();
      const sit: Sit = {
        id: doc.id,
        location: {
          latitude: sitData.location.latitude,
          longitude: sitData.location.longitude
        },
        imageCollectionId: sitData.imageCollectionId,
        createdAt: sitData.createdAt,
        uploadedBy: sitData.uploadedBy
      };

      sits.set(sit.id, sit);
    });

    return sits;
  }

  // Get a single sit by ID
  static async getSit(sitId: string): Promise<Sit | null> {
    const sitDoc = await doc(db, 'sits', sitId);
    const sitData = (await sitDoc.get()).data();

    if (!sitData) return null;

    return {
      id: sitId,
      location: {
        latitude: sitData.location.latitude,
        longitude: sitData.location.longitude
      },
      imageCollectionId: sitData.imageCollectionId,
      createdAt: sitData.createdAt,
      uploadedBy: sitData.uploadedBy
    };
  }

  // Get images for a sit
  static async getImages(imageCollectionId: string): Promise<Image[]> {
    console.log('Fetching images for collection:', imageCollectionId);

    const imagesRef = collection(db, 'images');
    const q = query(
      imagesRef,
      where('collectionId', '==', imageCollectionId),
      where('deleted', '==', false)
    );

    const snapshot = await getDocs(q);
    console.log('Found images:', snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })));

    return snapshot.docs.map(doc => ({
      id: doc.id,
      photoURL: doc.data().photoURL,
      userId: doc.data().userId,
      userName: doc.data().userName,
      collectionId: doc.data().collectionId,
      createdAt: doc.data().createdAt
    }));
  }
}