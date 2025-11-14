import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';

const rootDir = resolve(__dirname, 'dist');

export default defineConfig({
  root: rootDir,
  publicDir: resolve(rootDir, 'public'),
  plugins: [
    legacy(),
    viteStaticCopy({
      targets: [
        {
          src: 'locales',
          dest: '.'
        },
        {
          src: 'js',
          dest: '.'
        },
        {
          src: 'css/i18n-antifouc.css',
          dest: 'css'
        },
        {
          src: resolve(__dirname, 'src-tauri/icons/*'),
          dest: 'icons'
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
