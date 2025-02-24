import { doc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MarkType } from '../types';

export class MarksManager {
  static async loadFavoriteCounts(): Promise<Map<string, number>> {
    try {
      const marksQuery = query(
        collection(db, 'favorites')
      );
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

  static async toggleFavorite(
    userId: string,
    sitId: string,
    currentMarks: Set<MarkType>
  ): Promise<{ marks: Set<MarkType>; favoriteCount: number }> {
    try {
      const newMarks = new Set<MarkType>();
      const docRef = doc(db, 'favorites', `${userId}_${sitId}`);
      const visitedRef = doc(db, 'visited', `${userId}_${sitId}`);
      const wantToGoRef = doc(db, 'wantToGo', `${userId}_${sitId}`);

      if (currentMarks.has('favorite')) {
        await deleteDoc(docRef);
      } else {
        // Clear other marks
        await Promise.all([
          deleteDoc(visitedRef),
          deleteDoc(wantToGoRef)
        ]);
        newMarks.add('favorite');
        await setDoc(docRef, {
          userId,
          sitId,
          createdAt: new Date()
        });
      }

      const countQuery = query(
        collection(db, 'favorites'),
        where('sitId', '==', sitId)
      );
      const snapshot = await getDocs(countQuery);
      return {
        marks: newMarks,
        favoriteCount: snapshot.size
      };
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  }

  static async toggleVisited(
    userId: string,
    sitId: string,
    currentMarks: Set<MarkType>
  ): Promise<{ marks: Set<MarkType>; favoriteCount?: number }> {
    try {
      const newMarks = new Set<MarkType>();
      const docRef = doc(db, 'visited', `${userId}_${sitId}`);
      const favoriteRef = doc(db, 'favorites', `${userId}_${sitId}`);
      const wantToGoRef = doc(db, 'wantToGo', `${userId}_${sitId}`);

      if (currentMarks.has('visited')) {
        await deleteDoc(docRef);
      } else {
        // Clear other marks
        await Promise.all([
          deleteDoc(favoriteRef),
          deleteDoc(wantToGoRef)
        ]);
        newMarks.add('visited');
        await setDoc(docRef, {
          userId,
          sitId,
          createdAt: new Date()
        });
      }

      // If we removed a favorite, get new count
      if (currentMarks.has('favorite')) {
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
      console.error('Error toggling visited:', error);
      throw error;
    }
  }

  static async toggleWantToGo(
    userId: string,
    sitId: string,
    currentMarks: Set<MarkType>
  ): Promise<{ marks: Set<MarkType>; favoriteCount?: number }> {
    try {
      const newMarks = new Set<MarkType>();
      const docRef = doc(db, 'wantToGo', `${userId}_${sitId}`);
      const favoriteRef = doc(db, 'favorites', `${userId}_${sitId}`);
      const visitedRef = doc(db, 'visited', `${userId}_${sitId}`);

      if (currentMarks.has('wantToGo')) {
        await deleteDoc(docRef);
      } else {
        // Clear other marks
        await Promise.all([
          deleteDoc(favoriteRef),
          deleteDoc(visitedRef)
        ]);
        newMarks.add('wantToGo');
        await setDoc(docRef, {
          userId,
          sitId,
          createdAt: new Date()
        });
      }

      // If we removed a favorite, get new count
      if (currentMarks.has('favorite')) {
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
      console.error('Error toggling want-to-go:', error);
      throw error;
    }
  }
}