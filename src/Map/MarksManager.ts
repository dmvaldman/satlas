import { doc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MarkType } from '../types';

export class MarksManager {
  static async loadFavoriteCounts(): Promise<Map<string, number>> {
    try {
      const marksQuery = query(collection(db, 'favorites'));
      const querySnapshot = await getDocs(marksQuery);

      // Count favorites per sitId
      const countMap = new Map<string, number>();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.sitId) {
          countMap.set(data.sitId, (countMap.get(data.sitId) || 0) + 1);
        }
      });

      return countMap;
    } catch (error) {
      console.error('Error loading favorite counts:', error);
      throw error;
    }
  }

  static async loadUserMarks(userId: string): Promise<Map<string, Set<MarkType>>> {
    try {
      // Query each collection separately
      const favoritesQuery = query(collection(db, 'favorites'), where('userId', '==', userId));
      const visitedQuery = query(collection(db, 'visited'), where('userId', '==', userId));
      const wantToGoQuery = query(collection(db, 'wantToGo'), where('userId', '==', userId));

      const [favoritesSnapshot, visitedSnapshot, wantToGoSnapshot] = await Promise.all([
        getDocs(favoritesQuery),
        getDocs(visitedQuery),
        getDocs(wantToGoQuery)
      ]);

      const marksMap = new Map<string, Set<MarkType>>();

      // Process favorites
      favoritesSnapshot.forEach(doc => {
        const sitId = doc.data().sitId;
        const marks = marksMap.get(sitId) || new Set<MarkType>();
        marks.add('favorite');
        marksMap.set(sitId, marks);
      });

      // Process visited
      visitedSnapshot.forEach(doc => {
        const sitId = doc.data().sitId;
        const marks = marksMap.get(sitId) || new Set<MarkType>();
        marks.add('visited');
        marksMap.set(sitId, marks);
      });

      // Process want to go
      wantToGoSnapshot.forEach(doc => {
        const sitId = doc.data().sitId;
        const marks = marksMap.get(sitId) || new Set<MarkType>();
        marks.add('wantToGo');
        marksMap.set(sitId, marks);
      });

      return marksMap;
    } catch (error) {
      console.error('Error loading user marks:', error);
      throw error;
    }
  }

  static async toggleMark(
    userId: string,
    sitId: string,
    markType: MarkType,
    currentMarks: Set<MarkType>
  ): Promise<{ marks: Set<MarkType>; favoriteCount?: number }> {
    try {
      const newMarks = new Set<MarkType>();

      // Document references for all mark types
      const favoriteRef = doc(db, 'favorites', `${userId}_${sitId}`);
      const visitedRef = doc(db, 'visited', `${userId}_${sitId}`);
      const wantToGoRef = doc(db, 'wantToGo', `${userId}_${sitId}`);

      // If the mark is already set, remove it
      if (currentMarks.has(markType)) {
        // Get the appropriate document reference
        const docRef = markType === 'favorite'
          ? favoriteRef
          : markType === 'visited'
            ? visitedRef
            : wantToGoRef;

        await deleteDoc(docRef);
      } else {
        // Clear all existing marks first
        await Promise.all([
          deleteDoc(favoriteRef),
          deleteDoc(visitedRef),
          deleteDoc(wantToGoRef)
        ]);

        // Add the new mark
        newMarks.add(markType);

        // Get the appropriate document reference and data
        let docRef;
        if (markType === 'favorite') {
          docRef = favoriteRef;
        } else if (markType === 'visited') {
          docRef = visitedRef;
        } else {
          docRef = wantToGoRef;
        }

        // Set the new mark
        await setDoc(docRef, {
          userId,
          sitId,
          createdAt: new Date()
        });
      }

      // If we're dealing with favorites, get the updated count
      if (markType === 'favorite' || currentMarks.has('favorite')) {
        const countQuery = query(
          collection(db, 'favorites'),
          where('sitId', '==', sitId)
        );
        const snapshot = await getDocs(countQuery);
        return {
          marks: newMarks,
          favoriteCount: snapshot.size
        };
      }

      return { marks: newMarks };
    } catch (error) {
      console.error(`Error toggling ${markType}:`, error);
      throw error;
    }
  }
}