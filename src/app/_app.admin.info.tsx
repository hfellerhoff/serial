import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin/info")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/stats" });
  },
});
