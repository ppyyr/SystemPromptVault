import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';

const rootDir = resolve(__dirname, 'dist');

export default defineConfig({
  root: rootDir,
  plugins: [
    legacy(),
    viteStaticCopy({
      targets: [
        {
          src: 'locales',
          dest: '.'
        }
      ]
    })
  ],
  server: {
    port: 1420,
    strictPort: true
  },
  build: {
    outDir: resolve(rootDir, '../build'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        settings: resolve(rootDir, 'settings.html')
      }
    }
  }
});
