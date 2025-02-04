import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { app } from './firebase';

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
    profileContainer?.addEventListener('click', () => this.handleProfileClick());

    // Initialize with default profile image
    const profileImage = document.getElementById('profile-image') as HTMLImageElement;
    if (profileImage) {
      profileImage.src = this.defaultProfileImage;
    }
  }

  private setupAuthStateListener() {
    onAuthStateChanged(this.auth, (user) => {
      console.log('Auth state changed:', {
        user,
        photoURL: user?.photoURL,
        displayName: user?.displayName,
        providerData: user?.providerData
      });
      this.currentUser = user;
      this.updateUI();
    });
  }

  private updateUI() {
    const loginButton = document.getElementById('login-button');
    const profileContainer = document.getElementById('profile-container');
    const profileImage = document.getElementById('profile-image') as HTMLImageElement;

    console.log('Updating UI, current user:', this.currentUser);

    if (this.currentUser) {
      console.log('Profile photo URL:', this.currentUser.photoURL);
      loginButton?.style.setProperty('display', 'none');
      profileContainer?.style.setProperty('display', 'block');
      if (profileImage) {
        profileImage.onerror = (e) => {
          console.error('Failed to load profile image:', e);
          profileImage.src = this.defaultProfileImage;
        };
        profileImage.onload = () => {
          console.log('Profile image loaded successfully');
        };
        profileImage.src = this.currentUser.photoURL || this.defaultProfileImage;
        console.log('Set profile image to:', profileImage.src);
      }
    } else {
      loginButton?.style.setProperty('display', 'flex');
      profileContainer?.style.setProperty('display', 'none');
      if (profileImage) {
        profileImage.src = this.defaultProfileImage;
        console.log('Set default profile image');
      }
    }
  }

  private async signIn() {
    try {
      const result = await signInWithPopup(this.auth, this.provider);
      console.log('Sign in result:', {
        user: result.user,
        photoURL: result.user?.photoURL,
        credential: result.credential,
        providerData: result.user?.providerData
      });
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