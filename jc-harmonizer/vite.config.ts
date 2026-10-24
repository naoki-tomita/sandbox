import { defineConfig } from "vite";

export default defineConfig({
  base: "/sandbox/jc-harmonizer/",
  // main.ts でトップレベル await を使うため
  build: { target: "es2022" },
});
