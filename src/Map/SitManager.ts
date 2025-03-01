import { collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Sit, Image, Coordinates } from '../types';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { addDoc } from 'firebase/firestore';
import { storage } from '../firebase';

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
    const sitRef = doc(db, 'sits', sitId);
    const sitDoc = await getDoc(sitRef);
    const sitData = sitDoc.data();

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
    console.log('Raw image docs:', snapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
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

  static createInitialSit(coordinates: Coordinates, userId: string): Sit {
    return {
      id: `new_${Date.now()}`,
      location: coordinates,
      uploadedBy: userId
    };
  }

  static async createSit(coordinates: Coordinates, imageCollectionId: string, userId: string): Promise<Sit> {
    const sitRef = doc(collection(db, 'sits'));
    const sitData = {
      location: coordinates,
      imageCollectionId,
      createdAt: new Date(),
      uploadedBy: userId
    };

    await setDoc(sitRef, sitData);

    return {
      id: sitRef.id,
      ...sitData
    };
  }

  static async addPhotoToSit(
    photoData: string,
    imageCollectionId: string,
    userId: string,
    userName: string
  ): Promise<void> {
    // Upload photo
    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);

    // Detect content type from base64 data
    let contentType = 'image/jpeg'; // Default
    if (photoData.startsWith('data:')) {
      const matches = photoData.match(/^data:([A-Za-z-+/]+);base64,/);
      if (matches && matches.length > 1) {
        contentType = matches[1];
      }
    }

    const base64WithoutPrefix = photoData.replace(/^data:image\/\w+;base64,/, '');

    // Add metadata with detected content type
    const metadata = {
      contentType: contentType
    };

    // Upload with metadata
    await uploadString(storageRef, base64WithoutPrefix, 'base64', metadata);

    // Use CDN URL
    const photoURL = `https://satlas-world.web.app/images/sits/${filename}`;

    // Add to existing collection
    await addDoc(collection(db, 'images'), {
      photoURL,
      userId,
      userName,
      collectionId: imageCollectionId,
      createdAt: new Date(),
      deleted: false
    });
  }

  static async createSitWithPhoto(
    photoData: string,
    location: Coordinates,
    userId: string,
    userName: string
  ): Promise<Sit> {
    // Upload photo
    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);

    // Detect content type from base64 data
    let contentType = 'image/jpeg'; // Default
    if (photoData.startsWith('data:')) {
      const matches = photoData.match(/^data:([A-Za-z-+/]+);base64,/);
      if (matches && matches.length > 1) {
        contentType = matches[1];
      }
    }

    const base64WithoutPrefix = photoData.replace(/^data:image\/\w+;base64,/, '');

    // Add metadata with detected content type
    const metadata = {
      contentType: contentType
    };

    // Upload with metadata
    await uploadString(storageRef, base64WithoutPrefix, 'base64', metadata);

    // Use CDN URL
    const photoURL = `https://satlas-world.web.app/images/sits/${filename}`;

    // Create image collection
    const imageCollectionId = `${Date.now()}_${userId}`;
    await addDoc(collection(db, 'images'), {
      photoURL,
      userId,
      userName,
      collectionId: imageCollectionId,
      createdAt: new Date(),
      deleted: false
    });

    // Create the sit
    return await this.createSit(location, imageCollectionId, userId);
  }
}