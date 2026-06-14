import { createFileRoute } from "@tanstack/react-router";
import { getGuideOgResponse } from "~/server/og/guideResponse";

export const Route = createFileRoute("/api/og/guides/$slug")({
  server: {
    handlers: {
      GET: ({ params }) => getGuideOgResponse(params.slug),
    },
  },
});
