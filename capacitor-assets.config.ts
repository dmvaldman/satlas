import { run } from '@capacitor/assets';

const config = {
  images: {
    ios: {
      splash: {
        image: 'src/assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff'
      },
      icon: {
        image: 'src/assets/icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff'
      }
    }
  }
};

run();