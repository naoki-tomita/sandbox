// オフラインでも開けるようにする Service Worker。
// PRECACHE (ビルドしたファイルの一覧) と VERSION は、ビルド時に vite.config.ts が先頭に書き足す。
/* global PRECACHE, VERSION */

const CACHE = `looper-${VERSION}`;
const scope = self.registration.scope;

// 初回に全ファイルをキャッシュしておく
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

// 古い版のキャッシュを消す
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("looper-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  // 画面はつながっていれば最新を取りに行き、つながらなければキャッシュを出す
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(scope)));
    return;
  }
  // ほかのファイルは名前にハッシュが入っているので、キャッシュにあればそれを使う
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
