import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

// ビルドしたファイルの一覧を先頭に足して、service-worker.js を dist/sw.js として書き出す
function serviceWorker(): Plugin {
  let root = "";
  let outDir = "";
  return {
    name: "service-worker",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const built = files(outDir)
        .map((f) => relative(outDir, f).split("\\").join("/"))
        .filter((f) => f !== "sw.js");
      const hash = createHash("sha256");
      for (const f of built) hash.update(f).update(readFileSync(join(outDir, f)));
      // index.html は "./" で開かれるので、その URL でキャッシュする
      const precache = built.map((f) => (f === "index.html" ? "./" : f));
      const header = `const PRECACHE = ${JSON.stringify(precache)};\nconst VERSION = "${hash.digest("hex").slice(0, 12)}";\n`;
      writeFileSync(join(outDir, "sw.js"), header + readFileSync(join(root, "service-worker.js"), "utf8"));
    },
  };
}

export default defineConfig({
  base: "/sandbox/looper/",
  build: { target: "es2022" },
  plugins: [serviceWorker()],
});
