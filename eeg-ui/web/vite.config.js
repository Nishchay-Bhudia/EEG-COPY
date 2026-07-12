import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Vite + Vue 3 SPA config for the EEG Control Hub.
// - '@' resolves to src/ (matches the STRICT CONVENTIONS import style)
// - dev proxy forwards '/api' → backend on :3000 so the api() helper works
//   unchanged and session cookies pass through (changeOrigin + credentials).
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
