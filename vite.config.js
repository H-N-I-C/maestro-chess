import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // relative base so the same build works at the server root and under a
  // GitHub Pages project path (e.g. /maestro-chess/)
  base: './',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: { chunkSizeWarningLimit: 1200 },
});
