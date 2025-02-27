import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';

// Load env file
dotenv.config();

export default defineConfig({
  plugins: [react()],
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
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
    // This is needed for some libraries that use process.env
    'process.env': {
      ...process.env
    }
  }
});
