import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import packageJson from './package.json' with { type: 'json' };
import { resolveDevServerHost } from './scripts/vite-dev-host.mjs';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: resolveDevServerHost(),
    port: 5174,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/target/**', '**/target/**'] },
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    manifest: true,
  },
});
