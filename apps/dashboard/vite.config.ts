import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const port = Number(process.env.DASHBOARD_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    proxy: {
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/v2': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
