import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiUrl = env.VITE_SADHANA_API_URL?.trim();
  const api = apiUrl ? new URL(apiUrl) : undefined;
  const apiPrefix = api?.pathname.replace(/\/$/, '') || '';

  return {
    root: 'app',
    envDir: '..',
    publicDir: 'public',
    plugins: [react()],
    base: process.env.VITE_BASE_PATH || '/',
    build: { outDir: '../dist', emptyOutDir: true },
    server: {
      proxy: api
        ? {
            '/__sadhana_api': {
              target: api.origin,
              changeOrigin: true,
              secure: true,
              rewrite: (path) => `${apiPrefix}${path.replace(/^\/__sadhana_api/, '')}`,
            },
          }
        : undefined,
    },
  };
});
