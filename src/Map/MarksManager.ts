import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { MarkType } from '../types';

export class MarksManager {
  static async loadFavoriteCounts(): Promise<Map<string, number>> {
    try {
      const marksQuery = query(
        collection(db, 'marks'),
        where('types', 'array-contains', 'favorite')
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
      const marksQuery = query(
        collection(db, 'marks'),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(marksQuery);

      const marksMap = new Map<string, Set<MarkType>>();
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        if (data?.sitId && data?.types && Array.isArray(data.types)) {
          marksMap.set(data.sitId, new Set<MarkType>(data.types));
        }
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
    type: MarkType,
    currentMarks: Set<MarkType>
  ): Promise<{
    marks: Set<MarkType>;
    favoriteCount?: number;  // Only returned if type is 'favorite'
  }> {
    try {
      const newMarks = new Set(currentMarks);
      const wasFavorite = newMarks.has('favorite');

      if (newMarks.has(type)) {
        newMarks.delete(type);
      } else {
        newMarks.add(type);
      }

      // Update Firestore
      await setDoc(doc(db, 'marks', `${userId}_${sitId}`), {
        userId,
        sitId,
        types: Array.from(newMarks),
        updatedAt: new Date()
      });

      // If this was a favorite toggle, get the new count
      if (type === 'favorite') {
        const isFavorite = newMarks.has('favorite');
        if (wasFavorite !== isFavorite) {
          const countQuery = query(
            collection(db, 'marks'),
            where('sitId', '==', sitId),
            where('types', 'array-contains', 'favorite')
          );
          const snapshot = await getDocs(countQuery);
          return {
            marks: newMarks,
            favoriteCount: snapshot.size
          };
        }
      }

      return { marks: newMarks };
    } catch (error) {
      console.error('Error toggling mark:', error);
      throw error;
    }
  }
}