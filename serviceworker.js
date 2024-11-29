const cacheName = "diar-cache-v1";
const assets = [
    "/",
    "/index.html",
    "/manifest.json",
    "/web-app-manifest-192x192.png",
    "/web-app-manifest-512x512.png",
    "/styles.css",
    "/script.js"
];

// Install the service worker
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(cacheName).then((cache) => {
            return cache.addAll(assets);
        })
    );
});

// Fetch the cached assets
self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

// Activate and clean old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== cacheName)
                    .map((name) => caches.delete(name))
            );
        })
    );
});
