import { createContext, useContext, useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Sit, Coordinates, Image } from '../types';
import { useAuth } from './AuthContext';
import { getDistanceInFeet } from '../types';

interface SitsContextType {
  sits: Map<string, Sit>;
  loadNearbySits: (bounds: { north: number; south: number }) => Promise<void>;
  uploadSit: (base64Image: string, coordinates: Coordinates) => Promise<Sit>;
  addImageToSit: (sitId: string, base64Image: string) => Promise<void>;
  getSit: (sitId: string) => Promise<Sit | null>;
  findNearbySit: (coordinates: Coordinates) => Promise<Sit | null>;
  getImagesForSit: (imageCollectionId: string) => Promise<Image[]>;
}

const SitsContext = createContext<SitsContextType>({
  sits: new Map(),
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
});

export const useSits = () => useContext(SitsContext);

export const SitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sits, setSits] = useState<Map<string, Sit>>(new Map());
  const { user } = useAuth();

  const loadNearbySits = async (bounds: { north: number; south: number }) => {
    const sitsRef = collection(db, 'sits');
    const q = query(
      sitsRef,
      where('location.latitude', '>=', bounds.south),
      where('location.latitude', '<=', bounds.north)
    );

    const querySnapshot = await getDocs(q);
    const newSits = new Map(sits);

    querySnapshot.docs.forEach(doc => {
      const sit = { ...doc.data(), id: doc.id } as Sit;
      newSits.set(sit.id, sit);
    });

    setSits(newSits);
  };

  const uploadSit = async (base64Image: string, coordinates: Coordinates): Promise<Sit> => {
    if (!user) throw new Error('Must be logged in to upload');

    // Upload image to storage
    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);
    const base64WithoutPrefix = base64Image.replace(/^data:image\/\w+;base64,/, '');
    await uploadString(storageRef, base64WithoutPrefix, 'base64');
    const photoURL = await getDownloadURL(storageRef);

    // Create sit data
    const imageCollectionId = `${Date.now()}_${user.uid}`;
    const sitData = {
      location: coordinates,
      imageCollectionId,
      uploadedBy: user.uid,
      createdAt: serverTimestamp()
    };

    // Add sit to Firestore
    const docRef = await addDoc(collection(db, 'sits'), sitData);
    const sit = { ...sitData, id: docRef.id } as Sit;

    // Add image to images collection
    await addDoc(collection(db, 'images'), {
      photoURL,
      userId: user.uid,
      userName: user.displayName || 'Anonymous',
      collectionId: imageCollectionId,
      createdAt: serverTimestamp()
    });

    // Update local state
    setSits(new Map(sits.set(sit.id, sit)));

    return sit;
  };

  const addImageToSit = async (sitId: string, base64Image: string) => {
    if (!user) throw new Error('Must be logged in to add images');

    const sit = sits.get(sitId);
    if (!sit) throw new Error('Sit not found');

    // Upload image
    const filename = `sit_${Date.now()}.jpg`;
    const storageRef = ref(storage, `sits/${filename}`);
    const base64WithoutPrefix = base64Image.replace(/^data:image\/\w+;base64,/, '');
    await uploadString(storageRef, base64WithoutPrefix, 'base64');
    const photoURL = await getDownloadURL(storageRef);

    // Add to images collection
    await addDoc(collection(db, 'images'), {
      photoURL,
      userId: user.uid,
      userName: user.displayName || 'Anonymous',
      collectionId: sit.imageCollectionId,
      createdAt: serverTimestamp()
    });
  };

  const getSit = async (sitId: string): Promise<Sit | null> => {
    // Check cache first
    const cachedSit = sits.get(sitId);
    if (cachedSit) return cachedSit;

    // If not in cache, fetch from Firestore
    const sitDoc = await getDoc(doc(db, 'sits', sitId));
    if (sitDoc.exists()) {
      const sit = { ...sitDoc.data(), id: sitDoc.id } as Sit;
      setSits(new Map(sits.set(sit.id, sit)));
      return sit;
    }
    return null;
  };

  const findNearbySit = async (coordinates: Coordinates): Promise<Sit | null> => {
    // Check cache first
    for (const sit of sits.values()) {
      if (getDistanceInFeet(coordinates, sit.location) < 100) {
        return sit;
      }
    }

    // If not found in cache, query Firestore
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

  const getImagesForSit = async (imageCollectionId: string): Promise<Image[]> => {
    if (!imageCollectionId) {
      console.warn('No imageCollectionId provided to getImagesForSit');
      return [];
    }

    const imagesRef = collection(db, 'images');
    const q = query(imagesRef, where('collectionId', '==', imageCollectionId));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Image));
  };

  return (
    <SitsContext.Provider
      value={{
        sits,
        loadNearbySits,
        uploadSit,
        addImageToSit,
        getSit,
        findNearbySit,
        getImagesForSit,
      }}
    >
      {children}
    </SitsContext.Provider>
  );
};