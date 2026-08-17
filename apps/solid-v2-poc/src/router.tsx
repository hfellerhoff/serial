import { createRouter } from '@tanstack/solid-router';

import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultPendingComponent: () => (
    <main class="page-shell" aria-busy="true">
      Loading…
    </main>
  ),
});

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router;
  }
}
