import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sandbox/openworld/',
  // Rapier の WASM (base64 同梱) で 5MB 近くになるため警告の閾値を上げる
  build: { chunkSizeWarningLimit: 6000 },
});
