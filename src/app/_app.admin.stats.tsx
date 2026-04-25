"use client";

import { createFileRoute } from "@tanstack/react-router";
import { AdminTabs } from "~/components/admin/AdminTabs";
import { UserSignupsChart } from "~/components/admin/UserSignupsChart";
import { UserSigninsChart } from "~/components/admin/UserSigninsChart";
import { UserRetentionChart } from "~/components/admin/UserRetentionChart";
import { UserFeedCountChart } from "~/components/admin/UserFeedCountChart";
import { adminMiddleware } from "~/server/auth";

export const Route = createFileRoute("/_app/admin/stats")({
  component: AdminStatsPage,
  server: {
    middleware: [adminMiddleware],
  },
});

function AdminStatsPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <AdminTabs value="stats" />

      <div className="mt-6 flex flex-col gap-6">
        <UserSignupsChart />
        <UserSigninsChart />
        <UserRetentionChart />
        <UserFeedCountChart />
      </div>
    </div>
  );
}
