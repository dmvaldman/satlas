import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserSitMark, MarkType } from './types';

export class MarksManager {
  private marks: Map<string, Set<MarkType>> = new Map();  // sitId -> Set of mark types
  private counts: Map<string, Map<MarkType, number>> = new Map();  // sitId -> (markType -> count)

  constructor() {}

  async loadUserMarks(userId: string | null) {
    this.marks.clear();
    this.counts.clear();

    if (!userId) return;

    const marksRef = collection(db, 'userSitMarks');
    const q = query(marksRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((doc) => {
      const mark = doc.data() as UserSitMark;
      this.updateLocalMark(mark.sitId, mark.type, true);
    });

    // Load counts for all mark types
    await this.loadMarksCounts();
  }

  private async loadMarksCounts() {
    const marksRef = collection(db, 'userSitMarks');
    const querySnapshot = await getDocs(marksRef);

    querySnapshot.forEach((doc) => {
      const mark = doc.data() as UserSitMark;
      if (!this.counts.has(mark.sitId)) {
        this.counts.set(mark.sitId, new Map());
      }
      const sitCounts = this.counts.get(mark.sitId)!;
      sitCounts.set(mark.type, (sitCounts.get(mark.type) || 0) + 1);
    });
  }

  async toggleMark(sitId: string, userId: string, type: MarkType) {
    const hasType = this.hasMark(sitId, type);
    const markRef = doc(db, 'userSitMarks', `${userId}_${sitId}_${type}`);

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

    // Update local state
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