import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Served at /verya-planet-of-living-light/ in the combined Cloudflare deployment.
  base: command === 'build' ? '/verya-planet-of-living-light/' : '/',
  server: { port: 5173, strictPort: false },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: 'index.html', gemini: 'gemini.html' } },
  },
}));
