import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: path.resolve(__dirname, 'renderer'),
    build: {
        outDir: path.resolve(__dirname, 'dist-renderer'),
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3123',
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'renderer/src'),
        },
    },
});
