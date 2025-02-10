import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserSitMark, MarkType } from '../types';
import { useAuth } from './AuthContext';

interface MarksContextType {
  marks: Map<string, Set<MarkType>>;
  counts: Map<string, Map<MarkType, number>>;
  loadUserMarks: (userId: string | null) => Promise<void>;
  toggleMark: (sitId: string, type: MarkType) => Promise<void>;
  hasMark: (sitId: string, type: MarkType) => boolean;
  getMarkCount: (sitId: string, type: MarkType) => number;
  getMarks: (sitId: string) => Set<MarkType>;
}

const MarksContext = createContext<MarksContextType>({
  marks: new Map(),
  counts: new Map(),
  loadUserMarks: async () => {},
  toggleMark: async () => {},
  hasMark: () => false,
  getMarkCount: () => 0,
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
  const [counts, setCounts] = useState<Map<string, Map<MarkType, number>>>(new Map());
  const { user } = useAuth();

  const loadUserMarks = useCallback(async (userId: string | null) => {
    if (!userId) {
      setMarks(new Map());
      setCounts(new Map());
      return;
    }

    const newMarks = new Map();
    const newCounts = new Map();

    // Load favorites
    const favoritesRef = collection(db, 'favorites');
    const favoritesQuery = query(favoritesRef, where('userId', '==', userId));
    const favoritesSnapshot = await getDocs(favoritesQuery);

    // Load visited
    const visitedRef = collection(db, 'visited');
    const visitedQuery = query(visitedRef, where('userId', '==', userId));
    const visitedSnapshot = await getDocs(visitedQuery);

    // Load wantToGo marks (new collection)
    const wantToGoRef = collection(db, 'wantToGo');
    const wantToGoQuery = query(wantToGoRef, where('userId', '==', userId));
    const wantToGoSnapshot = await getDocs(wantToGoQuery);

    // Process all three types of marks
    [favoritesSnapshot, visitedSnapshot, wantToGoSnapshot].forEach((snapshot, index) => {
      // Determine mark type based on snapshot order:
      // index 0: favorite, index 1: visited, index 2: wantToGo
      const type: MarkType = index === 0 ? 'favorite' : index === 1 ? 'visited' : 'wantToGo';
      snapshot.forEach((doc) => {
        const mark = doc.data() as UserSitMark;
        // Update marks
        if (!newMarks.has(mark.sitId)) {
          newMarks.set(mark.sitId, new Set());
        }
        newMarks.get(mark.sitId)!.add(type);

        // Update counts
        if (!newCounts.has(mark.sitId)) {
          newCounts.set(mark.sitId, new Map());
        }
        const sitCounts = newCounts.get(mark.sitId)!;
        sitCounts.set(type, (sitCounts.get(type) || 0) + 1);
      });
    });

    setMarks(newMarks);
    setCounts(newCounts);
  }, []);

  const toggleMark = useCallback(async (sitId: string, type: MarkType) => {
    console.log('toggleMark called:', { sitId, type, user });
    if (!user) return;

    const hasType = marks.get(sitId)?.has(type) || false;
    console.log('Before toggle:', { sitId, type, hasType, marks: new Map(marks) });

    // Determine the collection name based on the mark type
    let collectionName = '';
    if (type === 'favorite') {
      collectionName = 'favorites';
    } else if (type === 'visited') {
      collectionName = 'visited';
    } else if (type === 'wantToGo') {
      collectionName = 'wantToGo';
    }

    const markRef = doc(db, collectionName, `${user.uid}_${sitId}`);

    try {
      // Optimistic update
      const newMarks = new Map(marks);
      if (!newMarks.has(sitId)) {
        newMarks.set(sitId, new Set());
      }
      const sitMarks = newMarks.get(sitId)!;
      hasType ? sitMarks.delete(type) : sitMarks.add(type);
      setMarks(newMarks);

      // Update counts optimistically
      const newCounts = new Map(counts);
      if (!newCounts.has(sitId)) {
        newCounts.set(sitId, new Map());
      }
      const sitCounts = newCounts.get(sitId)!;
      const currentCount = sitCounts.get(type) || 0;
      sitCounts.set(type, currentCount + (hasType ? -1 : 1));
      setCounts(newCounts);

      console.log('After optimistic update:', {
        marks: new Map(newMarks),
        counts: new Map(newCounts)
      });

      // Use a locally computed timestamp instead of serverTimestamp
      if (hasType) {
        await deleteDoc(markRef);
      } else {
        const mark: UserSitMark = {
          userId: user.uid,
          sitId,
          type,
          // Compute timestamp locally
          createdAt: new Date()
        };
        await setDoc(markRef, mark);
      }
      console.log('Database update complete');
    } catch (error) {
      console.error('Error toggling mark:', error);
      // Revert optimistic updates on error
      const newMarks = new Map(marks);
      const sitMarks = newMarks.get(sitId);
      if (sitMarks) {
        hasType ? sitMarks.add(type) : sitMarks.delete(type);
        setMarks(newMarks);
      }

      const newCounts = new Map(counts);
      const sitCounts = newCounts.get(sitId);
      if (sitCounts) {
        const currentCount = sitCounts.get(type) || 0;
        sitCounts.set(type, currentCount + (hasType ? 1 : -1));
        setCounts(newCounts);
      }
    }
  }, [user, marks, counts]);

  const hasMark = (sitId: string, type: MarkType): boolean => {
    return marks.get(sitId)?.has(type) || false;
  };

  const getMarkCount = (sitId: string, type: MarkType): number => {
    return counts.get(sitId)?.get(type) || 0;
  };

  const getMarks = (sitId: string): Set<MarkType> => {
    return marks.get(sitId) || new Set();
  };

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
      setCounts(new Map());
    }

    return () => {
      unsubscribed = true;
    };
  }, [user, loadUserMarks]);

  return (
    <MarksContext.Provider
      value={{
        marks,
        counts,
        loadUserMarks,
        toggleMark,
        hasMark,
        getMarkCount,
        getMarks,
      }}
    >
      {children}
    </MarksContext.Provider>
  );
};
