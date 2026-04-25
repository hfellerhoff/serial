"use client";

import { createFileRoute } from "@tanstack/react-router";
import { AdminTabs } from "~/components/admin/AdminTabs";
import { PublicSignupToggle } from "~/components/admin/PublicSignupToggle";
import { SignupNotificationSetting } from "~/components/admin/SignupNotificationSetting";
import { adminMiddleware } from "~/server/auth";

export const Route = createFileRoute("/_app/admin/settings")({
  component: AdminSettingsPage,
  server: {
    middleware: [adminMiddleware],
  },
});

function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <AdminTabs value="settings" />

      <div className="mt-6 flex flex-col gap-4">
        <PublicSignupToggle />
        <SignupNotificationSetting />
      </div>
    </div>
  );
}
