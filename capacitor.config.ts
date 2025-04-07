import { CapacitorConfig } from '@capacitor/cli';
import dotenv from 'dotenv';

dotenv.config(); // Ensure env vars are loaded

const config: CapacitorConfig = {
  appId: process.env.BUNDLE_ID,
  appName: 'Satlas',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    App: {
      appUrlOpen: {
        domains: ['satlas.earth']
      }
    },
    SplashScreen: {
      backgroundColor: "#FFFFFF",
      showSpinner: false,
      launchFadeOutDuration: 200,
      launchAutoHide: false,
      androidScaleType: "CENTER",
      androidSplashResourceName: "splash",
    },
    StatusBar: {
      style: 'LIGHT',
      overlaysWebView: true,
      backgroundColor: '#00000000'
    },
    Permissions: {
      camera: true,
      geolocation: true,
      storage: true,
      photos: true,
      notifications: true
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com', 'apple.com'],
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    EdgeToEdge: {
      backgroundColor: "#000000"
    }
  }
};

const devConfig = process.env.NODE_ENV === 'development' ? {
  server: {
    url: 'http://localhost:5173',
    cleartext: true,
    androidScheme: 'http'
  }
} : {};

// Merge configurations
const mergedConfig = { ...config, ...devConfig };

export default mergedConfig;