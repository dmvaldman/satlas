import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useMarks } from '../../contexts/MarksContext';
import { useAuth } from '../../contexts/AuthContext';

export const FavoriteCount: React.FC<{ sitId: string }> = ({ sitId }) => {
  const { getFavoriteCount } = useMarks();
  const count = getFavoriteCount(sitId);

  return (
    <div className="favorite-count">
      {count} {count === 1 ? 'person' : 'people'} favorited this
    </div>
  );
};