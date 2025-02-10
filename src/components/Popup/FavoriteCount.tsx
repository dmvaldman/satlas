import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

interface FavoriteCountProps {
  sitId: string;
}

export const FavoriteCount: React.FC<FavoriteCountProps> = ({ sitId }) => {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchFavoriteCount = async () => {
      try {
        const favoritesRef = collection(db, 'favorites');
        const q = query(favoritesRef, where('sitId', '==', sitId));
        const snapshot = await getDocs(q);
        setCount(snapshot.size);
      } catch (error) {
        console.error('Error fetching favorite count:', error);
        setCount(null);
      }
    };

    fetchFavoriteCount();
  }, [sitId]);

  if (count === null) return null;
  if (count === 0) return null;

  return (
    <div className="favorite-count">
      Favorited by {count} {count === 1 ? 'person' : 'people'}
    </div>
  );
};