import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserSitMark, MarkType } from './types';

export class MarksManager {
  private marks: Map<string, Set<MarkType>> = new Map();
  private counts: Map<string, Map<MarkType, number>> = new Map();

  constructor() {}

  async loadUserMarks(userId: string | null) {
    this.marks.clear();
    this.counts.clear();

    if (!userId) return;

    // Load favorites
    const favoritesRef = collection(db, 'favorites');
    const favoritesQuery = query(favoritesRef, where('userId', '==', userId));
    const favoritesSnapshot = await getDocs(favoritesQuery);

    // Load visited
    const visitedRef = collection(db, 'visited');
    const visitedQuery = query(visitedRef, where('userId', '==', userId));
    const visitedSnapshot = await getDocs(visitedQuery);

    // Process favorites
    favoritesSnapshot.forEach((doc) => {
      const mark = doc.data() as UserSitMark;
      this.updateLocalMark(mark.sitId, 'favorite', true);
    });

    // Process visited
    visitedSnapshot.forEach((doc) => {
      const mark = doc.data() as UserSitMark;
      this.updateLocalMark(mark.sitId, 'visited', true);
    });

    // Load counts for all mark types
    await this.loadMarksCounts();
  }

  private async loadMarksCounts() {
    // Load favorite counts
    const favoritesRef = collection(db, 'favorites');
    const favoritesSnapshot = await getDocs(favoritesRef);

    // Load visited counts
    const visitedRef = collection(db, 'visited');
    const visitedSnapshot = await getDocs(visitedRef);

    // Process favorites
    favoritesSnapshot.forEach((doc) => {
      const mark = doc.data() as UserSitMark;
      if (!this.counts.has(mark.sitId)) {
        this.counts.set(mark.sitId, new Map());
      }
      const sitCounts = this.counts.get(mark.sitId)!;
      sitCounts.set('favorite', (sitCounts.get('favorite') || 0) + 1);
    });

    // Process visited
    visitedSnapshot.forEach((doc) => {
      const mark = doc.data() as UserSitMark;
      if (!this.counts.has(mark.sitId)) {
        this.counts.set(mark.sitId, new Map());
      }
      const sitCounts = this.counts.get(mark.sitId)!;
      sitCounts.set('visited', (sitCounts.get('visited') || 0) + 1);
    });
  }

  async toggleMark(sitId: string, userId: string, type: MarkType) {
    const hasType = this.hasMark(sitId, type);
    const collectionName = type === 'favorite' ? 'favorites' : 'visited';
    const markRef = doc(db, collectionName, `${userId}_${sitId}`);

    if (hasType) {
      await deleteDoc(markRef);
    } else {
      const mark: UserSitMark = {
        userId,
        sitId,
        type,
        createdAt: serverTimestamp()
      };
      await setDoc(markRef, mark);
    }

    this.updateLocalMark(sitId, type, !hasType);
    this.updateCount(sitId, type, hasType ? -1 : 1);
  }

  private updateLocalMark(sitId: string, type: MarkType, value: boolean) {
    if (!this.marks.has(sitId)) {
      this.marks.set(sitId, new Set());
    }
    const sitMarks = this.marks.get(sitId)!;

    if (value) {
      sitMarks.add(type);
    } else {
      sitMarks.delete(type);
    }
  }

  private updateCount(sitId: string, type: MarkType, delta: number) {
    if (!this.counts.has(sitId)) {
      this.counts.set(sitId, new Map());
    }
    const sitCounts = this.counts.get(sitId)!;
    sitCounts.set(type, (sitCounts.get(type) || 0) + delta);
  }

  hasMark(sitId: string, type: MarkType): boolean {
    return this.marks.get(sitId)?.has(type) || false;
  }

  getMarkCount(sitId: string, type: MarkType): number {
    return this.counts.get(sitId)?.get(type) || 0;
  }

  getMarks(sitId: string): Set<MarkType> {
    return this.marks.get(sitId) || new Set();
  }
}