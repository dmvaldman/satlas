import { createContext, useContext, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '../firebase';
import { useAuth } from './AuthContext';
import { UserPreferences } from '../types';

interface ProfileContextType {
  isProfileOpen: boolean;
  openProfile: () => void;
  closeProfile: () => void;
  savePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  userPreferences: UserPreferences | null;
}

const ProfileContext = createContext<ProfileContextType>({
  isProfileOpen: false,
  openProfile: () => {},
  closeProfile: () => {},
  savePreferences: async () => {},
  userPreferences: null,
});

export const useProfile = () => useContext(ProfileContext);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const { user } = useAuth();

  const loadUserPreferences = async () => {
    if (!user) return;

    const userDoc = await getDoc(doc(db, 'userPreferences', user.uid));
    if (userDoc.exists()) {
      setUserPreferences(userDoc.data() as UserPreferences);
    } else {
      // Set defaults
      const defaults: UserPreferences = {
        nickname: user.displayName?.split(' ')[0] || '',
        pushNotificationsEnabled: false,
        lastVisit: Date.now(),
      };
      setUserPreferences(defaults);
    }
  };

  const savePreferences = async (prefs: Partial<UserPreferences>) => {
    if (!user) return;

    try {
      // Update Firestore
      await setDoc(
        doc(db, 'userPreferences', user.uid),
        { ...prefs, lastVisit: Date.now() },
        { merge: true }
      );

      // Update Firebase Auth profile if nickname changed
      if (prefs.nickname) {
        await updateProfile(user, {
          displayName: prefs.nickname
        });
      }

      // Update local state
      setUserPreferences(prev => prev ? { ...prev, ...prefs } : null);
    } catch (error) {
      console.error('Error saving preferences:', error);
      throw error;
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        isProfileOpen,
        openProfile: () => {
          loadUserPreferences();
          setIsProfileOpen(true);
        },
        closeProfile: () => setIsProfileOpen(false),
        savePreferences,
        userPreferences,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};