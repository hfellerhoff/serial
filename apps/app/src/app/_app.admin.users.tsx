"use client";

import { createFileRoute } from "@tanstack/react-router";
import { AdminTabs } from "~/components/admin/AdminTabs";
import { AdminUserList } from "~/components/admin/AdminUserList";
import { adminMiddleware } from "~/server/auth";

export const Route = createFileRoute("/_app/admin/users")({
  component: AdminUsersPage,
  server: {
    middleware: [adminMiddleware],
  },
});

function AdminUsersPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <AdminTabs value="users" />

      <div className="mt-6">
        <AdminUserList />
      </div>
    </div>
  );
}
