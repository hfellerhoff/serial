"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { UserSignupsChart } from "~/components/admin/UserSignupsChart";
import { UserSigninsChart } from "~/components/admin/UserSigninsChart";
import { adminMiddleware } from "~/server/auth";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/_app/admin/info")({
  component: AdminInfoPage,
  server: {
    middleware: [adminMiddleware],
  },
});

function AdminInfoPage() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeftIcon className="mr-2" size={16} />
          Admin Home
        </Button>
      </Link>
      <h2 className="pt-4 font-sans text-lg">Admin Info</h2>
      <div className="mt-6 flex flex-col gap-6">
        <UserSignupsChart />
        <UserSigninsChart />
      </div>
    </div>
  );
}
