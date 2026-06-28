"use client";

import type { ReactNode } from "react";

interface FlipItemProps {
  id: string;
  children: ReactNode;
}

/**
 * Thin wrapper that tags an item so `useFlipItems` can find it and drive its
 * FLIP animation imperatively. It deliberately exposes no `style` prop: the
 * hook owns inline `transform` / `opacity` / `position` on this node, and React
 * must not clobber them on re-render.
 *
 * This is the only animation of its kind in the app.
 */
export function FlipItem({ id, children }: FlipItemProps) {
  return <div data-flip-id={id}>{children}</div>;
}
