import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/playwrighttests/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ], environment: 'jsdom', include: ['app/tests/**/*.{test,spec}.{ts,tsx,mjs}'], clearMocks: true },
});
