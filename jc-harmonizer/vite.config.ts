import { defineConfig } from "vite";

export default defineConfig({
  base: "/sandbox/jc-harmonizer/",
  // audio.ts でトップレベル await を使うため
  build: { target: "es2022" },
  // JSX は zheleznaya の h 関数に変換する
  esbuild: { jsxFactory: "h" },
});
