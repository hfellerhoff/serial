import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BASE_SIGNED_OUT_URL, IS_MAIN_INSTANCE } from "~/lib/constants";

export const Route = createFileRoute("/_web/guides")({
  beforeLoad: () => {
    if (!IS_MAIN_INSTANCE) {
      throw redirect({ to: BASE_SIGNED_OUT_URL });
    }
  },
  component: GuidesLayout,
});

function GuidesLayout() {
  return <Outlet />;
}
