import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the MV3 popup into ../popup with relative asset paths (required for
// chrome-extension:// pages) and stable, hash-free filenames.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../popup',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'popup.js',
        assetFileNames: 'popup[extname]',
      },
    },
  },
});
