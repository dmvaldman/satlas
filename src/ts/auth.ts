import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { app } from './firebase';
import { profileManager } from './profile';

export class AuthManager {
  private auth = getAuth(app);
  private provider = new GoogleAuthProvider();
  private currentUser: User | null = null;
  private readonly defaultProfileImage = './assets/imgs/profile_blank.jpg';

  constructor() {
    // Configure Google provider with necessary scopes
    this.provider.addScope('profile');
    this.provider.addScope('email');
    this.provider.setCustomParameters({
      prompt: 'select_account'
    });

    this.setupAuthUI();
    this.setupAuthStateListener();
  }

  private setupAuthUI() {
    const loginButton = document.getElementById('login-button');
    const profileContainer = document.getElementById('profile-container');

    loginButton?.addEventListener('click', () => this.signIn());
    profileContainer?.addEventListener('click', () => {
      if (this.isAuthenticated()) {
        profileManager.showProfile();
      }
    });

    // Initialize with default profile image
    const profileImage = document.getElementById('profile-image') as HTMLImageElement;
    if (profileImage) {
      profileImage.src = this.defaultProfileImage;
    }
  }

  private setupAuthStateListener() {
    onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      this.updateUI();
    });
  }

  private updateUI() {
    const loginButton = document.getElementById('login-button');
    const profileContainer = document.getElementById('profile-container');
    const profileImage = document.getElementById('profile-image') as HTMLImageElement;

    if (this.currentUser) {
      loginButton?.style.setProperty('display', 'none');
      profileContainer?.style.setProperty('display', 'block');

      if (profileImage) {
        profileImage.onerror = () => {
          profileImage.src = this.defaultProfileImage;
        };
        profileImage.src = this.currentUser.photoURL || this.defaultProfileImage;
      }
    } else {
      loginButton?.style.setProperty('display', 'flex');
      profileContainer?.style.setProperty('display', 'none');
      if (profileImage) {
        profileImage.src = this.defaultProfileImage;
      }
    }
  }

  private async signIn() {
    try {
      await signInWithPopup(this.auth, this.provider);
    } catch (error) {
      console.error('Error signing in:', error);
    }
  }

  private async handleProfileClick() {
    // You can add a dropdown menu here later
    await this.signOut();
  }

  private async signOut() {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  public isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }
}

// Export a singleton instance
export const authManager = new AuthManager();