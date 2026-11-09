import { defineConfig } from 'vite';

// Tauri がフロントエンドを配信するための設定。
// ネイティブアプリなので base はルート固定（Pages 配信はしない）。
export default defineConfig({
  base: '/',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
});
