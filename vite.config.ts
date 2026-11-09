import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5181, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2023', chunkSizeWarningLimit: 1500, rollupOptions: { input: { index: 'index.html', minimal: 'demo/minimal.html' } } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
