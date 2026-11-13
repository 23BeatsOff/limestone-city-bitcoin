// =============================================================================
//  sw.js — service worker (offline support + installability)
// =============================================================================
//  Network-first for same-origin assets (so deploys show up immediately), with
//  a cache fallback so the app still opens offline. Live APIs (CoinGecko,
//  StatCan) are cross-origin and pass straight through, never cached.
// =============================================================================

const CACHE = "cdc-lcb-v1";
const CORE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/main.js",
  "./js/clock.js",
  "./js/data.js",
  "./js/live.js",
  "./js/format.js",
  "./js/odometer.js",
  "./js/provinces.js",
  "./js/sharecard.js",
  "./js/ottawa-compare.js",
  "./js/tip.js",
  "./js/truereturn.js",
  "./assets/doodles/line-chart-down.svg",
  "./assets/fonts/ibm-plex-mono-light.woff2",
  "./assets/grain.svg",
  "./assets/fonts/work-sans.woff2",
  "./assets/fonts/newsreader.woff2",
  "./assets/fonts/ibm-plex-mono.woff2",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cdc-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only handle same-origin GETs; live data APIs pass through to the network.
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
