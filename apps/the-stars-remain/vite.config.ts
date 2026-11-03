import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === 'build' ? '/the-stars-remain/' : '/',
    build: {
        target: 'es2020',
        sourcemap: false
    }
}));
