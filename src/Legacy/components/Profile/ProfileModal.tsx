import { useState, useEffect } from 'react';
import { useProfile } from '../../contexts/ProfileContext';
import { useAuth } from '../../contexts/AuthContext';

export const ProfileModal = () => {
  const { isProfileOpen, closeProfile, savePreferences, userPreferences } = useProfile();
  const { signOut } = useAuth();
  const [nickname, setNickname] = useState('');
  const [pushNotifications, setPushNotifications] = useState(false);

  useEffect(() => {
    if (userPreferences) {
      setNickname(userPreferences.nickname);
      setPushNotifications(userPreferences.pushNotificationsEnabled);
    }
  }, [userPreferences]);

  const handleSave = async () => {
    try {
      await savePreferences({
        nickname,
        pushNotificationsEnabled: pushNotifications,
      });
      closeProfile();
    } catch (error) {
      console.error('Error saving profile:', error);
    }
  };

  if (!isProfileOpen) return null;

  return (
    <div
      id="profile-modal"
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeProfile();
      }}
    >
      <div className="profile-content">
        <h2>Profile Settings</h2>
        <div className="profile-section">
          <label htmlFor="nickname">Nickname</label>
          <input
            type="text"
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter nickname"
          />
        </div>
        <div className="profile-section">
          <label className="toggle-label">
            <span>Enable Push Notifications</span>
            <input
              type="checkbox"
              checked={pushNotifications}
              onChange={(e) => setPushNotifications(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <div className="profile-section">
          <button
            className="profile-button"
            onClick={() => {/* TODO: Implement favorites view */}}
          >
            View Favorite Sits
          </button>
        </div>
        <div className="profile-actions">
          <button
            className="profile-button primary"
            onClick={handleSave}
          >
            Save
          </button>
          <button
            className="profile-button"
            onClick={closeProfile}
          >
            Close
          </button>
        </div>
        <div className="profile-section logout-section">
          <button
            className="profile-button danger"
            onClick={async () => {
              await signOut();
              closeProfile();
            }}
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
};