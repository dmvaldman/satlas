import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { VitePWA } from 'vite-plugin-pwa';

// Load env file
dotenv.config();

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2}'],
        globIgnores: ['**/mapbox-gl*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.tiles\.mapbox\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapbox-tiles-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mapbox-api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  define: {
    'process.env': process.env
  },
  base: './',
});
