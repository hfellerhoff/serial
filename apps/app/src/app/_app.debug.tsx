"use client";

import { createFileRoute } from "@tanstack/react-router";
import { FeedRefreshTimeframesChart } from "~/components/debug/FeedRefreshTimeframesChart";
import { adminMiddleware } from "~/server/auth";

export const Route = createFileRoute("/_app/debug")({
  component: DebugPage,
  server: {
    middleware: [adminMiddleware],
  },
});

function DebugPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="font-sans text-lg">Debug</h2>
      <div className="mt-6">
        <FeedRefreshTimeframesChart />
      </div>
    </div>
  );
}
