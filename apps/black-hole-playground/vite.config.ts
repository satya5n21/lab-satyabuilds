import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/black-hole-playground/' : '/',
  build: {
    rollupOptions: {
      // index.html is the playground; compare.html shows it next to gemini.html in two iframes.
      // No PostCSS here: gemini.html's Tailwind CSS is precompiled (see src/gemini/gemini.input.css).
      input: {
        main: resolve(__dirname, 'index.html'),
        compare: resolve(__dirname, 'compare.html'),
        gemini: resolve(__dirname, 'gemini.html'),
      },
    },
  },
}));
