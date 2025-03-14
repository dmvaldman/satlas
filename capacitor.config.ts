import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dmvaldman.Satlas',
  appName: 'Satlas',
  webDir: 'dist',
  server: {
    url: 'http://192.168.68.102:5173',
    cleartext: true,
    androidScheme: 'http'
  },
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

export default config;