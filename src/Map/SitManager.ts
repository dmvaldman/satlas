import { collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Sit, Image, Coordinates } from '../types';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
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

  static async deleteSit(sitId: string, userId: string): Promise<boolean> {
    // Get the sit first to verify ownership
    const sitRef = doc(db, 'sits', sitId);
    const sitDoc = await getDoc(sitRef);

    if (!sitDoc.exists()) {
      console.log(`Sit ${sitId} not found`);
      return false;
    }

    const sitData = sitDoc.data();

    // Verify ownership
    if (sitData.uploadedBy !== userId) {
      console.log(`User ${userId} is not the owner of sit ${sitId}, not deleting`);
      return false;
    }

    // Delete the sit
    await deleteDoc(sitRef);
    console.log(`Deleted sit ${sitId}`);
    return true;
  }

  static async deleteImage(imageId: string, userId: string): Promise<void> {
    // Get image data first
    const imageDoc = await getDoc(doc(db, 'images', imageId));
    if (!imageDoc.exists()) throw new Error('Image not found');

    const imageData = imageDoc.data();

    // Verify ownership
    if (imageData.userId !== userId) {
      throw new Error('Can only delete your own images');
    }

    // Get the collection ID for this image
    const collectionId = imageData.collectionId;
    if (!collectionId) {
      throw new Error('Image is not associated with a collection');
    }

    // Delete from storage first
    const filename = imageData.photoURL.split('/').pop()?.split('?')[0];
    if (filename) {
      const storageRef = ref(storage, `sits/${filename}`);
      try {
        await deleteObject(storageRef);
        console.log(`Deleted original image: ${filename}`);
        // The Cloud Function will handle deleting variations
      } catch (error) {
        console.error('Error deleting image file:', error);
      }
    }

    // Mark image as deleted in Firestore
    await setDoc(doc(db, 'images', imageId), {
      deleted: true,
      deletedAt: new Date(),
      deletedBy: userId
    }, { merge: true });

    // Check if this was the last image in the collection
    const imagesRef = collection(db, 'images');
    const q = query(
      imagesRef,
      where('collectionId', '==', collectionId),
      where('deleted', '==', false)
    );

    const remainingImages = await getDocs(q);

    // If no images remain, find and delete the sit
    if (remainingImages.empty) {
      console.log('No images remain in collection, deleting sit');

      // Find the sit with this collection ID
      const sitsRef = collection(db, 'sits');
      const sitQuery = query(sitsRef, where('imageCollectionId', '==', collectionId));
      const sitSnapshot = await getDocs(sitQuery);

      if (!sitSnapshot.empty) {
        // There should be only one sit with this collection ID
        const sitDoc = sitSnapshot.docs[0];
        const sitId = sitDoc.id;

        // Use the deleteSit method to handle the deletion
        await this.deleteSit(sitId, userId);
      }
    }
  }

  static replaceImage(sitId: string, imageId: string): { sitId: string, imageId: string } {
    // This method doesn't need to do much - it just returns the data in a structured format
    // In the future, you might add validation or other logic here
    return { sitId, imageId };
  }
}