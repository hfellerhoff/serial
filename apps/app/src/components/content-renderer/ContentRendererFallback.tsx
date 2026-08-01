import { Navigate } from "@tanstack/react-router";
import type { contentDestination } from "~/lib/data/content-items/resolver";
import { Button } from "~/components/ui/button";

export function ContentRendererFallback({
  destination,
}: {
  destination: ReturnType<typeof contentDestination>;
}) {
  if (!destination.external) {
    return <Navigate to={destination.href} replace />;
  }
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
