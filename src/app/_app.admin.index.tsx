"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminUserList } from "~/components/admin/AdminUserList";
import { PublicSignupToggle } from "~/components/admin/PublicSignupToggle";
import { adminMiddleware } from "~/server/auth";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminDashboard,
  server: {
    middleware: [adminMiddleware],
  },
});

function AdminDashboard() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-lg">Admin</h2>
        <Link
          to="/admin/info"
          className="text-muted-foreground hover:text-foreground text-sm underline"
        >
          View stats
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h3 className="font-sans text-base">Settings</h3>
          <PublicSignupToggle />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-sans text-base">Users</h3>
          <AdminUserList />
        </div>
      </div>
    </div>
  );
}
