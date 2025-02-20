import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../contexts/ProfileContext';

export const ProfileButton = () => {
  const { user } = useAuth();
  const { openProfile } = useProfile();
  const defaultProfileImage = './assets/imgs/profile_blank.jpg';

  if (!user) return null;

  return (
    <div
      id="profile-container"
      onClick={openProfile}
    >
      <img
        id="profile-image"
        src={user.photoURL || defaultProfileImage}
        alt="Profile"
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          img.src = defaultProfileImage;
        }}
      />
    </div>
  );
};