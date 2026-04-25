/**
 * Returns the primary scroll container — the SidebarInset `<main>` element.
 * Falls back to `document.documentElement` when the sidebar layout isn't
 * mounted (e.g. auth pages).
 */
export function getScrollContainer(): HTMLElement {
  return (
    document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]') ??
    document.documentElement
  );
}
