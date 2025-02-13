import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Sit, Coordinates, Image } from '../types';
import { useAuth } from './AuthContext';
import { getDistanceInFeet } from '../types';

interface SitsContextType {
  sits: Map<string, Sit>;
  imagesByCollection: Map<string, Image[]>;
  loadNearbySits: (bounds: { north: number; south: number }) => Promise<void>;
  uploadSit: (base64Image: string, coordinates: Coordinates) => Promise<Sit>;
  addImageToSit: (sitId: string, base64Image: string) => Promise<void>;
  getSit: (sitId: string) => Promise<Sit | null>;
  findNearbySit: (coordinates: Coordinates) => Promise<Sit | null>;
  getImagesForSit: (imageCollectionId: string) => Promise<Image[]>;
  deleteImage: (sitId: string, imageId: string) => Promise<void>;
  replaceImage: (sitId: string, imageId: string, newImageBase64: string) => Promise<void>;
}

const SitsContext = createContext<SitsContextType>({
  sits: new Map(),
  imagesByCollection: new Map(),
  loadNearbySits: async () => {},
  uploadSit: async () => ({
    id: '',
    location: { latitude: 0, longitude: 0 },
    imageCollectionId: '',
    uploadedBy: '',
    createdAt: new Date()
  }),
  addImageToSit: async () => {},
  getSit: async () => null,
  findNearbySit: async () => null,
  getImagesForSit: async () => [],
  deleteImage: async () => {},
  replaceImage: async () => {},
});

export const useSits = () => useContext(SitsContext);

export const SitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sits, setSits] = useState<Map<string, Sit>>(new Map());
  const [imagesByCollection, setImagesByCollection] = useState<Map<string, Image[]>>(new Map());
  const { user } = useAuth();

  const loadNearbySits = useCallback(async (bounds: { north: number; south: number }) => {
    const sitsRef = collection(db, 'sits');
    const q = query(
      sitsRef,
      where('location.latitude', '>=', bounds.south),
      where('location.latitude', '<=', bounds.north)
    );

    const querySnapshot = await getDocs(q);
    const newSits = new Map(sits);
    let hasChanges = false;

    querySnapshot.docs.forEach(doc => {
      const sit = { ...doc.data(), id: doc.id } as Sit;
      if (!newSits.has(sit.id) || JSON.stringify(newSits.get(sit.id)) !== JSON.stringify(sit)) {
        newSits.set(sit.id, sit);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setSits(newSits);
    }
  }, []);

  const uploadSit = useCallback(async (base64Image: string, coordinates: Coordinates): Promise<Sit> => {
    if (!user?.uid) {
      console.error('Upload attempted without auth:', {
        userExists: !!user,
        uid: user?.uid
      });
      throw new Error('Must be logged in to upload');
    }

    try {
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);
      const base64WithoutPrefix = base64Image.replace(/^data:image\/\w+;base64,/, '');
      await uploadString(storageRef, base64WithoutPrefix, 'base64');
      const photoURL = await getDownloadURL(storageRef);

      const imageCollectionId = `${Date.now()}_${user.uid}`;
      const sitData = {
        location: coordinates,
        imageCollectionId,
        uploadedBy: user.uid,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'sits'), sitData);
      const sit = { ...sitData, id: docRef.id } as Sit;

      await addDoc(collection(db, 'images'), {
        photoURL,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        collectionId: imageCollectionId,
        createdAt: new Date()
      });

      setSits(new Map(sits.set(sit.id, sit)));

      setImagesByCollection(prev =>
        new Map(prev).set(imageCollectionId, [
          {
            id: 'initialId',
            photoURL,
            userId: user.uid,
            userName: user.displayName || 'Anonymous',
            collectionId: imageCollectionId,
            createdAt: new Date()
          }
        ])
      );

      return sit;
    } catch (error) {
      console.error('Error in uploadSit:', error, {
        authState: { userExists: !!user, uid: user?.uid }
      });
      throw error;
    }
  }, [user, sits]);

  const addImageToSit = async (sitId: string, base64Image: string) => {
    if (!user) throw new Error('Must be logged in to add images');

    const sit = sits.get(sitId);
    if (!sit) throw new Error('Sit not found');

    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);
    const base64WithoutPrefix = base64Image.replace(/^data:image\/\w+;base64,/, '');
    await uploadString(storageRef, base64WithoutPrefix, 'base64');
    const photoURL = await getDownloadURL(storageRef);

    await addDoc(collection(db, 'images'), {
      photoURL,
      userId: user.uid,
      userName: user.displayName || 'Anonymous',
      collectionId: sit.imageCollectionId,
      createdAt: serverTimestamp()
    });

    setImagesByCollection(prev => {
      const newMap = new Map(prev);
      const images = newMap.get(sit.imageCollectionId) || [];
      newMap.set(sit.imageCollectionId, [
        ...images,
        {
          id: 'newlyAddedId',
          photoURL,
          userId: user.uid,
          userName: user.displayName || 'Anonymous',
          collectionId: sit.imageCollectionId,
          createdAt: new Date()
        }
      ]);
      return newMap;
    });
  };

  const getSit = async (sitId: string): Promise<Sit | null> => {
    const cachedSit = sits.get(sitId);
    if (cachedSit) return cachedSit;

    const sitDoc = await getDoc(doc(db, 'sits', sitId));
    if (sitDoc.exists()) {
      const sit = { ...sitDoc.data(), id: sitDoc.id } as Sit;
      setSits(new Map(sits.set(sit.id, sit)));
      return sit;
    }
    return null;
  };

  const findNearbySit = async (coordinates: Coordinates): Promise<Sit | null> => {
    for (const sit of sits.values()) {
      if (getDistanceInFeet(coordinates, sit.location) < 100) {
        return sit;
      }
    }

    const sitsRef = collection(db, 'sits');
    const querySnapshot = await getDocs(sitsRef);

    for (const doc of querySnapshot.docs) {
      const sit = { ...doc.data(), id: doc.id } as Sit;
      if (getDistanceInFeet(coordinates, sit.location) < 100) {
        setSits(new Map(sits.set(sit.id, sit)));
        return sit;
      }
    }

    return null;
  };

  const getImagesForSit = useCallback(async (imageCollectionId: string): Promise<Image[]> => {
    if (imagesByCollection.has(imageCollectionId)) {
      return imagesByCollection.get(imageCollectionId)!;
    }

    const imagesRef = collection(db, 'images');
    const q = query(imagesRef, where('collectionId', '==', imageCollectionId));
    const snapshot = await getDocs(q);
    const images = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Image));

    setImagesByCollection(prev => new Map(prev).set(imageCollectionId, images));
    return images;
  }, [imagesByCollection]);

  const deleteImage = useCallback(async (sitId: string, imageId: string): Promise<void> => {
    if (!user) throw new Error('Must be logged in to delete images');

    try {
      let sitData = sits.get(sitId);
      if (!sitData) {
        const sitDoc = await getDoc(doc(db, 'sits', sitId));
        if (!sitDoc.exists()) {
          throw new Error('Sit not found in Firestore');
        }
        const newSitData = { ...sitDoc.data(), id: sitDoc.id } as Sit;
        sitData = newSitData;
        setSits(prevSits => {
          const newSits = new Map(prevSits);
          newSits.set(newSitData.id, newSitData);
          return newSits;
        });
      }

      console.log("Before deletion, images for sit", sitData.imageCollectionId, ":", imagesByCollection.get(sitData.imageCollectionId));

      setImagesByCollection(prevImages => {
        const newMap = new Map(prevImages);
        const currentImages = newMap.get(sitData!.imageCollectionId) || [];
        console.log("Current images count for sit", sitId, ":", currentImages.length);

        const updatedImages = currentImages.filter(img => img.id !== imageId);
        console.log("After removal, images count for sit", sitId, ":", updatedImages.length);
        newMap.set(sitData!.imageCollectionId, updatedImages);

        if (updatedImages.length === 0) {
          console.log("No images remain for sit", sitId, "- removing sit optimistically.");
          setSits(prevSits => {
            const newSits = new Map(prevSits);
            newSits.delete(sitId);
            return newSits;
          });
          window.dispatchEvent(new CustomEvent('sitDeleted', { detail: { sitId } }));
          deleteDoc(doc(db, 'sits', sitId)).catch(err => {
            console.error("Error deleting sit in Firestore:", err);
          });
        }
        return newMap;
      });

      await deleteDoc(doc(db, 'images', imageId));
    } catch (error) {
      console.error('Error in deleteImage:', error);
      throw error;
    }
  }, [user, sits]);

  const replaceImage = useCallback(async (sitId: string, imageId: string, newImageBase64: string): Promise<void> => {
    if (!user) throw new Error('Must be logged in to replace images');

    try {
      const filename = `sit_${Date.now()}.jpg`;
      const storageRef = ref(storage, `sits/${filename}`);
      const base64WithoutPrefix = newImageBase64.replace(/^data:image\/\w+;base64,/, '');
      await uploadString(storageRef, base64WithoutPrefix, 'base64');
      const photoURL = await getDownloadURL(storageRef);

      await setDoc(doc(db, 'images', imageId), {
        photoURL,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error replacing image:', error);
      throw error;
    }
  }, [user]);

  const value = useMemo(() => ({
    sits,
    imagesByCollection,
    loadNearbySits,
    uploadSit,
    addImageToSit,
    getSit,
    findNearbySit,
    getImagesForSit,
    deleteImage,
    replaceImage,
  }), [sits, imagesByCollection, loadNearbySits, uploadSit, addImageToSit, getSit, findNearbySit, getImagesForSit, deleteImage, replaceImage]);

  return (
    <SitsContext.Provider value={value}>
      {children}
    </SitsContext.Provider>
  );
};