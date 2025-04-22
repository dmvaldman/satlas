import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from "@sentry/react";
import App from './App';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Capacitor } from '@capacitor/core';

// Define the type for our custom event detail
interface AppErrorEventDetail {
  message: string;
  type: 'error'; // Assuming all boundary errors are 'error' type for notifications
  eventId?: string;
}

// Function to handle errors caught by the boundary
const handleBoundaryError = (error: unknown, componentStack: string | undefined, eventId: string) => {
  console.error("Sentry Boundary Caught:", { error, componentStack, eventId });
  // Dispatch a custom event that the Notification component can listen for
  const detail: AppErrorEventDetail = {
    message: 'An unexpected error occurred.', // Generic message, Sentry has details
    type: 'error',
    eventId: eventId
  };
  window.dispatchEvent(new CustomEvent<AppErrorEventDetail>('app-error', { detail }));
};

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV, // Set environment
  release: `satlas@${process.env.npm_package_version}`, // Match release format used in package.json
  tracesSampleRate: 1.0,
  debug: process.env.NODE_ENV === 'development',
  beforeSend(event, hint) {
    return event;
  },
  enableTracing: true,
});

// Initialize React app
const container = document.getElementById('root');
if (!container) throw new Error('Failed to find the root element');
const root = createRoot(container);

// Render App wrapped in ErrorBoundary
root.render(
  <Sentry.ErrorBoundary
    fallback={<></>}
    onError={handleBoundaryError}
  >
    <App />
  </Sentry.ErrorBoundary>
);

// Lock the screen orientation to portrait
if (Capacitor.isNativePlatform()) {
  ScreenOrientation.lock({ orientation: 'portrait' });
}