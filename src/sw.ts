/// <reference lib="webworker" />
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
} from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

// Clean up old caches from previous versions
cleanupOutdatedCaches();

// Precache static assets injected by workbox-build
// self.__WB_MANIFEST is injected by workbox-build at build time
precacheAndRoute(self.__WB_MANIFEST);

// Navigation requests - NetworkFirst with 3s timeout for fresh content with offline fallback
const navigationHandler = new NetworkFirst({
  cacheName: "navigation-cache",
  networkTimeoutSeconds: 3,
});

registerRoute(new NavigationRoute(navigationHandler));

// Static assets (JS/CSS) - CacheFirst (Vite hashes them, so safe to cache long-term)
registerRoute(
  ({ request }) =>
    request.destination === "script" || request.destination === "style",
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        maxEntries: 100,
      }),
    ],
  }),
);

// Fonts - CacheFirst with long expiration
registerRoute(
  ({ request }) => request.destination === "font",
  new CacheFirst({
    cacheName: "font-cache",
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        maxEntries: 30,
      }),
    ],
  }),
);

// Images - StaleWhileRevalidate
registerRoute(
  ({ request }) => request.destination === "image",
  new StaleWhileRevalidate({
    cacheName: "image-cache",
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        maxEntries: 100,
      }),
    ],
  }),
);

// YouTube thumbnails - StaleWhileRevalidate for offline feed viewing
registerRoute(
  ({ url }) =>
    url.hostname === "i.ytimg.com" || url.hostname === "img.youtube.com",
  new StaleWhileRevalidate({
    cacheName: "youtube-thumbnails",
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        maxEntries: 200,
      }),
    ],
  }),
);

// API calls (ORPC) - NetworkFirst with 5s timeout
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/rpc"),
  new NetworkFirst({
    cacheName: "api-cache",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 60 * 60, // 1 hour
        maxEntries: 50,
      }),
    ],
  }),
);

// Listen for skip waiting message from client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
