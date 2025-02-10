import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserSitMark, MarkType } from '../types';
import { useAuth } from './AuthContext';

interface MarksContextType {
  marks: Map<string, Set<MarkType>>;
  loadUserMarks: (userId: string | null) => Promise<void>;
  toggleMark: (sitId: string, type: MarkType) => Promise<void>;
  hasMark: (sitId: string, type: MarkType) => boolean;
  getMarks: (sitId: string) => Set<MarkType>;
}

const MarksContext = createContext<MarksContextType>({
  marks: new Map(),
  loadUserMarks: async () => {},
  toggleMark: async () => {},
  hasMark: () => false,
  getMarks: () => new Set(),
});

export const useMarks = () => {
  const context = useContext(MarksContext);
  if (context === undefined) {
    throw new Error('useMarks must be used within a MarksProvider');
  }
  return context;
};

export const MarksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [marks, setMarks] = useState<Map<string, Set<MarkType>>>(new Map());
  const { user } = useAuth();

  const loadUserMarks = useCallback(async (userId: string | null) => {
    if (!userId) {
      setMarks(new Map());
      return;
    }

    const newMarks = new Map();

    // Load all types of marks
    const collections = ['favorites', 'visited', 'wantToGo'];
    const types: MarkType[] = ['favorite', 'visited', 'wantToGo'];

    await Promise.all(collections.map(async (collectionName, index) => {
      const ref = collection(db, collectionName);
      const q = query(ref, where('userId', '==', userId));
      const snapshot = await getDocs(q);

      snapshot.forEach((doc) => {
        const mark = doc.data() as UserSitMark;
        if (!newMarks.has(mark.sitId)) {
          newMarks.set(mark.sitId, new Set());
        }
        newMarks.get(mark.sitId)!.add(types[index]);
      });
    }));

    setMarks(newMarks);
  }, []);

  const toggleMark = useCallback(async (sitId: string, type: MarkType) => {
    if (!user) return;

    const collectionName = {
      favorite: 'favorites',
      visited: 'visited',
      wantToGo: 'wantToGo'
    }[type];

    const markRef = doc(db, collectionName, `${user.uid}_${sitId}`);
    const hasType = marks.get(sitId)?.has(type) || false;

    try {
      // Optimistic update for marks
      setMarks(prevMarks => {
        const newMarks = new Map(prevMarks);
        const sitMarks = newMarks.get(sitId) || new Set();
        hasType ? sitMarks.delete(type) : sitMarks.add(type);
        newMarks.set(sitId, sitMarks);
        return newMarks;
      });

      // Update database
      if (hasType) {
        await deleteDoc(markRef);
      } else {
        await setDoc(markRef, {
          userId: user.uid,
          sitId,
          type,
          createdAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error toggling mark:', error);
      // Revert optimistic update
      setMarks(prevMarks => {
        const newMarks = new Map(prevMarks);
        const sitMarks = newMarks.get(sitId) || new Set();
        hasType ? sitMarks.add(type) : sitMarks.delete(type);
        newMarks.set(sitId, sitMarks);
        return newMarks;
      });
    }
  }, [user, marks]);

  const hasMark = useCallback((sitId: string, type: MarkType): boolean => {
    return marks.get(sitId)?.has(type) || false;
  }, [marks]);

  const getMarks = useCallback((sitId: string): Set<MarkType> => {
    return marks.get(sitId) || new Set();
  }, [marks]);

  // Load user's marks when auth state changes
  useEffect(() => {
    let unsubscribed = false;

    if (user) {
      loadUserMarks(user.uid).catch(error => {
        if (!unsubscribed) {
          console.error('Error loading marks:', error);
        }
      });
    } else {
      setMarks(new Map());
    }

    return () => {
      unsubscribed = true;
    };
  }, [user, loadUserMarks]);

  return (
    <MarksContext.Provider
      value={{
        marks,
        loadUserMarks,
        toggleMark,
        hasMark,
        getMarks,
      }}
    >
      {children}
    </MarksContext.Provider>
  );
};
