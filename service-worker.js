/**
 * service-worker.js
 * -----------------------------------------------------------------------------
 * SUMMARY:
 * Makes the app installable and lets the "shell" (HTML/CSS/JS files) load
 * instantly on repeat visits, even with a flaky connection. It deliberately
 * does NOT cache API responses (calendar events, weather) - that data needs
 * to be fresh every time, so those requests always go straight to the
 * network.
 *
 * CACHE-FIRST FOR SHELL FILES ONLY:
 * Anything listed in SHELL_FILES is cached on install and served from cache
 * first. Anything else (i.e. calls to googleapis.com or open-meteo.com)
 * falls through to a normal network request, untouched.
 * -----------------------------------------------------------------------------
 */

const CACHE_NAME = "schedule-weather-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up any caches from a previous version of the service worker.
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Only intercept requests for our own shell files. Everything else
  // (Google's OAuth script, Calendar API, Open-Meteo) passes straight
  // through untouched so it's always live data.
  const isShellRequest = SHELL_FILES.some((shellPath) => {
    const resolvedShellUrl = new URL(shellPath, self.location.href).href;
    return requestUrl.href === resolvedShellUrl;
  });

  if (!isShellRequest) {
    return; // let the browser handle it normally
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      } else {
        return fetch(event.request);
      }
    })
  );
});
