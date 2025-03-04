import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.satlas.app',
  appName: 'Satlas',
  webDir: 'dist',
  server: {
    url: 'http://192.168.68.102:5173',
    cleartext: true
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
      photos: true
    }
  }
};

export default config;