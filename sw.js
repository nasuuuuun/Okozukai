/* sw.js — オフライン対応＋更新が自動で反映されるサービスワーカー
   方針：ネット優先（online なら最新を取得しキャッシュ更新／offline ならキャッシュを使用）。
   これにより、ホーム画面アイコンを入れ直さなくても、オンラインで開き直せば更新が反映される。 */
var CACHE = "okozukai-v3";
var ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/sound.js",
  "./js/storage.js",
  "./js/logic.js",
  "./js/app.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// ネット優先。成功したらキャッシュも最新化。失敗（オフライン）したらキャッシュを返す。
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});
