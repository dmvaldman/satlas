import { getAuth, updateProfile, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface UserPreferences {
  nickname: string;
  pushNotificationsEnabled: boolean;
}

export class ProfileManager {
  private modal: HTMLElement | null = null;
  private currentNickname: string = '';
  private pushNotificationsEnabled: boolean = false;
  private auth = getAuth();

  constructor() {
    this.createProfileModal();
    this.setupEventListeners();
  }

  private createProfileModal() {
    const modalHTML = `
      <div id="profile-modal" class="modal-overlay">
        <div class="profile-content">
          <h2>Profile Settings</h2>
          <div class="profile-section">
            <label for="nickname">Nickname</label>
            <input type="text" id="nickname" placeholder="Enter nickname">
          </div>
          <div class="profile-section">
            <label class="toggle-label">
              <span>Enable Push Notifications</span>
              <input type="checkbox" id="push-notifications">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="profile-section">
            <button id="view-favorites" class="profile-button">
              View Favorite Sits
            </button>
          </div>
          <div class="profile-actions">
            <button id="save-profile" class="profile-button primary">Save</button>
            <button id="close-profile" class="profile-button">Close</button>
          </div>
          <div class="profile-section logout-section">
            <button id="logout-button" class="profile-button danger">Log Out</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('profile-modal');
  }

  private setupEventListeners() {
    const saveButton = document.getElementById('save-profile');
    const closeButton = document.getElementById('close-profile');
    const favoritesButton = document.getElementById('view-favorites');
    const notificationsToggle = document.getElementById('push-notifications') as HTMLInputElement;
    const logoutButton = document.getElementById('logout-button');

    saveButton?.addEventListener('click', () => this.savePreferences());
    closeButton?.addEventListener('click', () => this.hideProfile());
    favoritesButton?.addEventListener('click', () => this.showFavorites());
    notificationsToggle?.addEventListener('change', (e) => {
      this.pushNotificationsEnabled = (e.target as HTMLInputElement).checked;
    });
    logoutButton?.addEventListener('click', () => this.handleLogout());

    // Add click handler for profile modal backdrop
    const profileModal = document.getElementById('profile-modal');
    if (profileModal) {
      profileModal.addEventListener('click', (e) => {
        // Only close if clicking the backdrop (not the modal content)
        if (e.target === profileModal) {
          profileModal.classList.remove('active');
        }
      });
    }
  }

  private async loadUserPreferences() {
    const user = this.auth.currentUser;
    if (!user) return;

    const userDoc = await getDoc(doc(db, 'userPreferences', user.uid));
    if (userDoc.exists()) {
      const prefs = userDoc.data() as UserPreferences;
      this.currentNickname = prefs.nickname;
      this.pushNotificationsEnabled = prefs.pushNotificationsEnabled;
    } else {
      // Set defaults from Google profile
      this.currentNickname = user.displayName?.split(' ')[0] || '';
      this.pushNotificationsEnabled = false;
    }

    // Update UI
    const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
    const notificationsToggle = document.getElementById('push-notifications') as HTMLInputElement;

    if (nicknameInput) nicknameInput.value = this.currentNickname;
    if (notificationsToggle) notificationsToggle.checked = this.pushNotificationsEnabled;
  }

  private async savePreferences() {
    const user = this.auth.currentUser;
    if (!user) return;

    const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
    const newNickname = nicknameInput.value.trim();

    if (newNickname) {
      // Save to Firestore
      await setDoc(doc(db, 'userPreferences', user.uid), {
        nickname: newNickname,
        pushNotificationsEnabled: this.pushNotificationsEnabled
      });

      // Update profile
      await updateProfile(user, {
        displayName: newNickname
      });

      this.currentNickname = newNickname;
      this.hideProfile();
    }
  }

  private showFavorites() {
    // To be implemented
    console.log('Favorites feature coming soon!');
  }

  private async handleLogout() {
    try {
      await signOut(this.auth);
      this.hideProfile();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  public showProfile() {
    this.loadUserPreferences();
    this.modal?.classList.add('active');
  }

  private hideProfile() {
    this.modal?.classList.remove('active');
  }
}

export const profileManager = new ProfileManager();