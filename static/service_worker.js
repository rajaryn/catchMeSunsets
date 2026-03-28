const CACHE_NAME = "sunsets-cache-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/static/style.css",
  "/static/script.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (
    url.includes("/pins") ||
    url.includes("/upload") ||
    url.includes("/static/images/")
  ) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }),
  );
});
