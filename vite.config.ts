import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { fs: { deny: ['**/.data/**', '**/.env*', '**/*.key', '**/operator-key', '**/.git/**', '**/scenarios/inherited-incident/controller/**'] } }, build: { outDir: 'dist', chunkSizeWarningLimit: 750, rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } } } } });
