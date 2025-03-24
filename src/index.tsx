import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SplashScreen } from '@capacitor/splash-screen';
import { ScreenOrientation } from '@capacitor/screen-orientation';

// Initialize React app
const container = document.getElementById('root');
if (!container) throw new Error('Failed to find the root element');
const root = createRoot(container);

// Hide the native splash screen once the app is ready
root.render(<App />);
SplashScreen.hide();

// Lock the screen orientation to portrait
ScreenOrientation.lock({ orientation: 'portrait' });