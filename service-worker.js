const CACHE_NAME = "home-dashboard-v15";

const FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./script-v15.js",
    "./manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(FILES))
    );
});

self.addEventListener("fetch", event => {
    const requestUrl = new URL(event.request.url);

    if (
        requestUrl.protocol !== "http:" &&
        requestUrl.protocol !== "https:"
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request);
        })
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
});
