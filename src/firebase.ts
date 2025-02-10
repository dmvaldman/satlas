import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBzkBoWgLjAvug6wKnuxYoEmSPXeC3h_rk",
  authDomain: "satlas-world.firebaseapp.com",
  databaseURL: "https://satlas-world.firebaseio.com",
  projectId: "satlas-world",
  storageBucket: "satlas-world.firebasestorage.app",
  messagingSenderId: "1042808346952",
  appId: "1:1042808346952:android:739de3f65a0856ae797b7d"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);