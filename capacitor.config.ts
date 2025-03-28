import type { CapacitorConfig } from '@capacitor/cli';

const baseConfig: CapacitorConfig = {
  appId: 'com.dmvaldman.Satlas',
  appName: 'Satlas',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      backgroundColor: "#000000",
      showSpinner: false,
      spinnerColor: '#FFFFFF',
      launchFadeOutDuration: 200,
      launchAutoHide: false,
      androidSplashResourceName: "splash",
      androidScaleType: "FIT_CENTER",
      androidSpinnerStyle: 'large'
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
    SignInWithApple: {
      clientId: 'com.dmvaldman.Satlas',
      redirectURI: 'com.dmvaldman.Satlas://login',
      scopes: 'email name'
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

export default { ...baseConfig, ...devConfig };