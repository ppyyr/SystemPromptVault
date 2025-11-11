import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'node:path';

const rootDir = resolve(__dirname, 'dist');

export default defineConfig({
  root: rootDir,
  plugins: [
    legacy()
  ],
  server: {
    port: 1420,
    strictPort: true
  },
  build: {
    outDir: resolve(rootDir, '../build'),
    emptyOutDir: true
  }
});
