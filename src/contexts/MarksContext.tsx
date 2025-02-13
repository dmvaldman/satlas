import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserSitMark, MarkType } from '../types';
import { useAuth } from './AuthContext';

interface MarksContextType {
  marks: Map<string, Set<MarkType>>;
  favoriteCount: Map<string, number>;  // sitId -> count
  marksLoaded: boolean;
  loadUserMarks: (userId: string | null) => Promise<void>;
  toggleMark: (sitId: string, type: MarkType) => Promise<void>;
  hasMark: (sitId: string, type: MarkType) => boolean;
  getMarks: (sitId: string) => Set<MarkType>;
  getFavoriteCount: (sitId: string) => number;
}

const MarksContext = createContext<MarksContextType>({
  marks: new Map(),
  favoriteCount: new Map(),
  marksLoaded: false,
  loadUserMarks: async () => {},
  toggleMark: async () => {},
  hasMark: () => false,
  getMarks: () => new Set(),
  getFavoriteCount: () => 0,
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
  const [favoriteCount, setFavoriteCount] = useState<Map<string, number>>(new Map());
  const [marksLoaded, setMarksLoaded] = useState(false);
  const { user, authIsReady } = useAuth();

  const loadUserMarks = useCallback(async (userId: string | null) => {
    if (!userId) {
      setMarks(new Map());
      setFavoriteCount(new Map());
      debugger;
      setMarksLoaded(true);
      return;
    }

    const newMarks = new Map();

    // Load all types of marks
    const collections = ['favorites', 'visited', 'wantToGo'];
    const types: MarkType[] = ['favorite', 'visited', 'wantToGo'];

    await Promise.all(collections.map(async (collectionName, index) => {
      const ref = collection(db, collectionName);

      // For favorites, get the count for each sit
      if (collectionName === 'favorites') {
        // Get all favorites to count theMm by sitId
        const allFavoritesSnapshot = await getDocs(collection(db, 'favorites'));
        const counts = new Map();

        allFavoritesSnapshot.forEach(doc => {
          const mark = doc.data() as UserSitMark;
          const currentCount = counts.get(mark.sitId) || 0;
          counts.set(mark.sitId, currentCount + 1);
        });

        setFavoriteCount(counts);
      }

      // Get user's marks
      const q = query(ref, where('userId', '==', userId));
      const snapshot = await getDocs(q);

      snapshot.forEach((doc) => {
        const mark = doc.data() as UserSitMark;
        if (!newMarks.has(mark.sitId)) {
          newMarks.set(mark.sitId, new Set());
        }
        newMarks.get(mark.sitId)!.add(types[index]);
        console.log("Added type to mark", mark.sitId, types[index]);
      });
    }));

    setMarks(newMarks);
    debugger
    setMarksLoaded(true);
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

      // Update favorite count if it's a favorite mark
      if (type === 'favorite') {
        setFavoriteCount(prev => {
          const newCount = new Map(prev);
          const currentCount = prev.get(sitId) || 0;
          newCount.set(sitId, currentCount + (hasType ? -1 : 1));
          return newCount;
        });
      }

      // Emit event for marker styling
      window.dispatchEvent(new CustomEvent('markUpdated', {
        detail: {
          sitId,
          type,
          isActive: !hasType,
          userId: user.uid
        }
      }));

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

  const getFavoriteCount = useCallback((sitId: string): number => {
    return favoriteCount.get(sitId) || 0;
  }, [favoriteCount]);

  // Load user's marks when auth state changes
  useEffect(() => {
    let unsubscribed = false;

    // Only proceed once authentication is ready
    if (!authIsReady) return;

    if (user) {
      loadUserMarks(user.uid).catch(error => {
        if (!unsubscribed) {
          console.error('Error loading marks:', error);
          setMarksLoaded(true);
        }
      });
    } else {
      setMarks(new Map());
      setMarksLoaded(true);
    }

    return () => {
      unsubscribed = true;
    };
  }, [user, loadUserMarks, authIsReady]);

  return (
    <MarksContext.Provider
      value={{
        marks,
        favoriteCount,
        marksLoaded,
        loadUserMarks,
        toggleMark,
        hasMark,
        getMarks,
        getFavoriteCount,
      }}
    >
      {children}
    </MarksContext.Provider>
  );
};
