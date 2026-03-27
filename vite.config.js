import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api/hearings': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
      '/api/seoul': {
        target: 'http://openapi.seoul.go.kr:8088',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/seoul/, ''),
      },
    },
  },
});
