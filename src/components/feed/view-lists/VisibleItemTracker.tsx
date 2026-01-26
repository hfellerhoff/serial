"use client";

import { useEffect, useRef } from "react";
import {
  useAddVisibleIndex,
  useRemoveVisibleIndex,
} from "~/lib/data/visible-items-store";

interface VisibleItemTrackerProps {
  index: number;
  children: React.ReactNode;
}

export function VisibleItemTracker({
  index,
  children,
}: VisibleItemTrackerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const addVisibleIndex = useAddVisibleIndex();
  const removeVisibleIndex = useRemoveVisibleIndex();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            addVisibleIndex(index);
          } else {
            removeVisibleIndex(index);
          }
        });
      },
      {
        root: null,
        rootMargin: "0px",
        threshold: 1, // Only fire when 100% visible
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      removeVisibleIndex(index);
    };
  }, [index, addVisibleIndex, removeVisibleIndex]);

  return <div ref={ref}>{children}</div>;
}
