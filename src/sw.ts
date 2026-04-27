/// <reference lib="webworker" />
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import {
  NavigationRoute,
  registerRoute,
  setCatchHandler,
} from "workbox-routing";
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
} from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

// Take control of all open clients as soon as the SW activates, and warm
// the navigation cache so offline works even before the user's first
// SW-controlled navigation. Without clients.claim(), the first page load
// that triggers installation isn't controlled until the user reloads —
// meaning offline support doesn't kick in until the second visit. On iOS
// Safari this is especially important because the browser aggressively
// kills idle service workers.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // TanStack Start is fully SSR — there are no static HTML files in the
      // build output, so precacheAndRoute never caches any document. Warm
      // the navigation cache with the root page so there's always *something*
      // to serve when the user opens the app offline.
      caches.open("navigation-cache").then((cache) =>
        cache.add("/").catch(() => {
          // Non-critical — the next real navigation will populate the cache
          // via the NetworkFirst handler.
        }),
      ),
    ]),
  );
});

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

// Offline navigation fallback.
// TanStack Start is fully SSR — there are no static HTML files in the build
// output. Navigation responses are only cached as users visit pages. If the
// user navigates to an uncached URL while offline (or the cache was evicted),
// fall back to the cached root page so the app shell loads instead of showing
// a browser error. The client-side router can then resolve the correct route.
setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    // Layer 1: try the runtime navigation cache (SSR HTML with hydration data)
    const cache = await caches.open("navigation-cache");
    // ignoreVary prevents mismatches between the warm-up request's headers
    // (Accept: */*) and the real navigation request's headers (Accept:
    // text/html,...) when the server sends a Vary header.
    const cachedRoot = await cache.match("/", { ignoreVary: true });
    if (cachedRoot) {
      return cachedRoot;
    }

    // Layer 2: static offline page from the precache. The precache is
    // populated during SW install and is more durable than runtime caches —
    // iOS Safari can evict runtime caches after ~7 days of inactivity, but
    // the precache survives as long as the SW registration exists.
    const offlinePage = await matchPrecache("/offline.html");
    if (offlinePage) {
      return offlinePage;
    }
  }

  return Response.error();
});

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

// Listen for messages from the client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }

  // Re-warm the navigation cache on every app launch. iOS Safari evicts all
  // cached data after ~7 days of inactivity, so the activate-time warm-up
  // alone isn't enough — each online visit needs to reset that clock.
  if (event.data && event.data.type === "WARM_NAVIGATION_CACHE") {
    void caches.open("navigation-cache").then((cache) =>
      cache.add("/").catch(() => {
        // Non-critical — the NetworkFirst handler will cache on next navigation.
      }),
    );
  }
});
