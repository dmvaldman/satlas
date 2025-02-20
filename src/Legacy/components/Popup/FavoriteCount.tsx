import { useMarks } from '../../contexts/MarksContext';

export const FavoriteCount: React.FC<{ sitId: string }> = ({ sitId }) => {
  const { getFavoriteCount } = useMarks();
  const count = getFavoriteCount(sitId);

  if (count === 0) return null;

  return (
    <div className="favorite-count">
      {count} {count === 1 ? 'person' : 'people'} favorited this
    </div>
  );
};