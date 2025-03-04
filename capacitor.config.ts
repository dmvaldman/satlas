import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.satlas.app',
  appName: 'Satlas',
  webDir: 'dist',
  server: {
    url: 'http://192.168.68.102:5173',
    cleartext: true
  }
};

export default config;