import { useAuth } from '../../contexts/AuthContext';
import { LoginButton } from './LoginButton';
import { ProfileButton } from './ProfileButton';

export const AuthContainer = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div id="auth-container">
      {isAuthenticated ? <ProfileButton /> : <LoginButton />}
    </div>
  );
};