import { createContext, useContext, useState, useEffect } from 'react';
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
  }, [user]);

  const loadUserMarks = async (userId: string | null) => {
    if (!userId) {
      setMarks(new Map());
      setCounts(new Map());
      return;
    }

    const newMarks = new Map<string, Set<MarkType>>();
    const newCounts = new Map<string, Map<MarkType, number>>();

    // Load all mark types
    const markTypes: MarkType[] = ['favorite', 'visited', 'wantToGo'];

    for (const type of markTypes) {
      const collectionName = type === 'favorite' ? 'favorites' : type + 's';
      const marksRef = collection(db, collectionName);
      const q = query(marksRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);

      // Process user's marks
      snapshot.forEach((doc) => {
        const mark = doc.data() as UserSitMark;
        if (!newMarks.has(mark.sitId)) {
          newMarks.set(mark.sitId, new Set());
        }
        newMarks.get(mark.sitId)!.add(type);
      });

      // Load counts for each type
      const countsQuery = query(marksRef);
      const countsSnapshot = await getDocs(countsQuery);

      countsSnapshot.forEach((doc) => {
        const mark = doc.data() as UserSitMark;
        if (!newCounts.has(mark.sitId)) {
          newCounts.set(mark.sitId, new Map());
        }
        const sitCounts = newCounts.get(mark.sitId)!;
        sitCounts.set(type, (sitCounts.get(type) || 0) + 1);
      });
    }

    setMarks(newMarks);
    setCounts(newCounts);
  };

  const toggleMark = async (sitId: string, type: MarkType) => {
    if (!user) {
      throw new Error('Must be logged in to mark sits');
    }

    const collectionName = type === 'favorite' ? 'favorites' : type + 's';
    const markId = `${user.uid}_${sitId}`;
    const markRef = doc(db, collectionName, markId);
    const hasType = hasMark(sitId, type);

    // Optimistically update UI
    const newMarks = new Map(marks);
    if (!newMarks.has(sitId)) {
      newMarks.set(sitId, new Set());
    }
    const sitMarks = newMarks.get(sitId)!;

    const newCounts = new Map(counts);
    if (!newCounts.has(sitId)) {
      newCounts.set(sitId, new Map());
    }
    const sitCounts = newCounts.get(sitId)!;

    if (hasType) {
      sitMarks.delete(type);
      sitCounts.set(type, Math.max(0, (sitCounts.get(type) || 1) - 1));
    } else {
      sitMarks.add(type);
      sitCounts.set(type, (sitCounts.get(type) || 0) + 1);
    }

    setMarks(newMarks);
    setCounts(newCounts);

    try {
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
      // Revert optimistic update on error
      if (hasType) {
        sitMarks.add(type);
        sitCounts.set(type, (sitCounts.get(type) || 0) + 1);
      } else {
        sitMarks.delete(type);
        sitCounts.set(type, Math.max(0, (sitCounts.get(type) || 1) - 1));
      }
      setMarks(newMarks);
      setCounts(newCounts);
      throw error;
    }
  };

  const hasMark = (sitId: string, type: MarkType): boolean => {
    return marks.get(sitId)?.has(type) || false;
  };

  const getMarkCount = (sitId: string, type: MarkType): number => {
    return counts.get(sitId)?.get(type) || 0;
  };

  const getMarks = (sitId: string): Set<MarkType> => {
    return marks.get(sitId) || new Set();
  };

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
