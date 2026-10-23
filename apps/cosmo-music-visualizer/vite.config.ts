import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Serve from the app root during development and from its subdirectory in
  // the combined Cloudflare static site build.
  base: command === 'build' ? '/cosmo-music-visualizer/' : '/',
}))

