import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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

export const useMarks = () => useContext(MarksContext);

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

    // Process marks and counts
    [favoritesSnapshot, visitedSnapshot].forEach((snapshot, index) => {
      const type: MarkType = index === 0 ? 'favorite' : 'visited';
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
    if (!user) return;

    const hasType = marks.get(sitId)?.has(type) || false;
    console.log('Before toggle:', { sitId, type, hasType, marks: new Map(marks) });

    const collectionName = type === 'favorite' ? 'favorites' : 'visited';
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

      // Perform the actual update
      if (hasType) {
        await deleteDoc(markRef);
      } else {
        const mark: UserSitMark = {
          userId: user.uid,
          sitId,
          type,
          createdAt: serverTimestamp()
        };
        await setDoc(markRef, mark);
      }
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

    console.log('After toggle:', { sitId, type, hasType: !hasType, marks: newMarks });
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
