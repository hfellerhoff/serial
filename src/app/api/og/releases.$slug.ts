import { createFileRoute } from "@tanstack/react-router";
import { getReleaseOgResponse } from "~/server/og/releaseResponse";

export const Route = createFileRoute("/api/og/releases/$slug")({
  server: {
    handlers: {
      GET: ({ params }) => getReleaseOgResponse(params.slug),
    },
  },
});
