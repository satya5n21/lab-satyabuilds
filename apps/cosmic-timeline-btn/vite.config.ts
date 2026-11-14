import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Served at /cosmic-timeline-btn/ in the combined Cloudflare deployment.
  base: command === 'build' ? '/cosmic-timeline-btn/' : '/',
}));
