import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useMarks } from '../../contexts/MarksContext';
import { useAuth } from '../../contexts/AuthContext';

interface FavoriteCountProps {
  sitId: string;
}

export const FavoriteCount: React.FC<FavoriteCountProps> = ({ sitId }) => {
  const [count, setCount] = useState<number | null>(null);
  const { hasMark } = useMarks();
  const { user } = useAuth();
  const [wasInitiallyFavorited, setWasInitiallyFavorited] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchFavoriteCount = async () => {
      try {
        const favoritesRef = collection(db, 'favorites');
        const q = query(favoritesRef, where('sitId', '==', sitId));
        const snapshot = await getDocs(q);
        setCount(snapshot.size);

        // Store the initial favorite state
        if (wasInitiallyFavorited === null && user) {
          setWasInitiallyFavorited(hasMark(sitId, 'favorite'));
        }
      } catch (error) {
        console.error('Error fetching favorite count:', error);
        setCount(null);
      }
    };

    fetchFavoriteCount();
  }, [sitId]);

  // If we have both the count and initial state, we can calculate the adjusted count
  if (count === null || wasInitiallyFavorited === null) return null;

  // Calculate local adjustment
  const currentlyFavorited = hasMark(sitId, 'favorite');
  let adjustment = 0;
  if (currentlyFavorited && !wasInitiallyFavorited) {
    adjustment = 1;  // Added a favorite
  } else if (!currentlyFavorited && wasInitiallyFavorited) {
    adjustment = -1;  // Removed a favorite
  }

  const adjustedCount = count + adjustment;
  if (adjustedCount === 0) return null;

  return (
    <div className="favorite-count">
      Favorited by {adjustedCount} {adjustedCount === 1 ? 'person' : 'people'}
    </div>
  );
};