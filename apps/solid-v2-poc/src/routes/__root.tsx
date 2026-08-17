import {
  HeadContent,
  Link,
  Outlet,
  createRootRoute,
} from '@tanstack/solid-router';

function RootLayout() {
  return (
    <>
      <HeadContent />
      <header class="app-header">
        <Link
          class="brand"
          to="/"
          aria-label="Serial Solid 2 proof of concept home"
        >
          Serial <span>Solid 2 PoC</span>
        </Link>
      </header>
      <Outlet />
    </>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <main class="page-shell">
      <p class="eyebrow">404</p>
      <h1>That route does not exist.</h1>
      <Link to="/">Return to the proof of concept</Link>
    </main>
  ),
});
