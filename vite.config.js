import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';

const rootDir = resolve(__dirname, 'dist');

export default defineConfig({
  root: rootDir,
  publicDir: resolve(rootDir, 'public'),
  cacheDir: resolve(__dirname, 'node_modules/.vite'),
  resolve: {
    alias: {
      '@tauri-apps/api': resolve(__dirname, 'node_modules/@tauri-apps/api')
    }
  },
  plugins: [
    legacy(),
    viteStaticCopy({
      targets: [
        {
          src: 'locales',
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
    strictPort: true,
    fs: {
      allow: ['..']
    }
  },
  optimizeDeps: {
    include: [
      '@tauri-apps/api/core',
      '@tauri-apps/api/event',
      '@tauri-apps/api/window'
    ]
  },
  build: {
    outDir: resolve(rootDir, '../build'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        settings: resolve(rootDir, 'settings.html'),
        about: resolve(rootDir, 'about.html')
      }
    }
  }
});
