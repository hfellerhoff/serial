"use client";

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import type { contentDestination } from "~/lib/data/content-items/resolver";
import { Button } from "~/components/ui/button";

export function ContentRendererFallback({
  destination,
}: {
  destination: ReturnType<typeof contentDestination>;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!destination.external) {
      void router.navigate({ to: destination.href });
    }
  }, [destination, router]);
  if (!destination.external) return null;
  return (
    <div className="mx-auto max-w-xl p-6">
      <Button asChild>
        <a href={destination.href} target="_blank" rel="noopener noreferrer">
          {destination.actionLabel}
        </a>
      </Button>
    </div>
  );
}
