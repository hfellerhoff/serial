"use client";

import { createFileRoute } from "@tanstack/react-router";
import { AdminUserDetails } from "~/components/admin/AdminUserDetails";
import { adminMiddleware } from "~/server/auth";
import { fetchAdminUserById } from "~/server/auth/endpoints";

export const Route = createFileRoute("/_app/admin/user/$id")({
  component: AdminUserPage,
  server: {
    middleware: [adminMiddleware],
  },
  loader: ({ params }) => fetchAdminUserById({ data: params.id }),
});

function AdminUserPage() {
  const data = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <AdminUserDetails data={data} />
    </div>
  );
}
