import type { CapacitorConfig } from '@capacitor/cli';

const baseConfig: CapacitorConfig = {
  appId: 'com.dmvaldman.Satlas',
  appName: 'Satlas',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#FFFFFF",
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#3880ff',
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
      providers: ['google.com'],
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#3880ff",
      sound: "beep.wav"
    }
  }
};

const devConfig = process.env.NODE_ENV === 'development' ? {
  server: {
    url: 'http://192.168.68.102:5173',
    cleartext: true,
    androidScheme: 'http'
  }
} : {};

export default { ...baseConfig, ...devConfig };