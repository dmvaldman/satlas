import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { serverTimestamp } from 'firebase/firestore';

export class FavoritesManager {
  private userFavorites: Set<string> = new Set();
  private favoritesCounts: Map<string, number> = new Map();

  async loadUserFavorites(userId: string | null): Promise<void> {
    if (!userId) {
      this.userFavorites.clear();
      return;
    }

    try {
      const favoritesRef = collection(db, 'favorites');
      const q = query(favoritesRef, where('userId', '==', userId));
      const querySnapshot = await getDocs(q);

      this.userFavorites.clear();
      querySnapshot.forEach((doc) => {
        this.userFavorites.add(doc.data().sitId);
      });
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  }

  async loadFavoritesCounts(sitIds: string[]): Promise<void> {
    try {
      const favoritesRef = collection(db, 'favorites');
      const q = query(favoritesRef, where('sitId', 'in', sitIds));
      const querySnapshot = await getDocs(q);

      sitIds.forEach(id => this.favoritesCounts.set(id, 0));

      querySnapshot.forEach((doc) => {
        const sitId = doc.data().sitId;
        this.favoritesCounts.set(sitId, (this.favoritesCounts.get(sitId) || 0) + 1);
      });
    } catch (error) {
      console.error('Error loading favorites counts:', error);
    }
  }

  async toggleFavorite(sitId: string, userId: string): Promise<void> {
    const favoriteId = `${userId}_${sitId}`;
    const favoriteRef = doc(db, 'favorites', favoriteId);
    const isFavorite = this.userFavorites.has(sitId);

    try {
      if (isFavorite) {
        await deleteDoc(favoriteRef);
      } else {
        await setDoc(favoriteRef, {
          userId,
          sitId,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  }

  isFavorite(sitId: string): boolean {
    return this.userFavorites.has(sitId);
  }

  getFavoriteCount(sitId: string): number {
    return this.favoritesCounts.get(sitId) || 0;
  }

  updateLocalFavorite(sitId: string, userId: string, isFavorite: boolean) {
    // Update the local favorites map
    if (isFavorite) {
      this.userFavorites.add(sitId);
      this.favoritesCounts.set(sitId, (this.favoritesCounts.get(sitId) || 0) + 1);
    } else {
      this.userFavorites.delete(sitId);
      this.favoritesCounts.set(sitId, Math.max(0, (this.favoritesCounts.get(sitId) || 1) - 1));
    }
  }
}