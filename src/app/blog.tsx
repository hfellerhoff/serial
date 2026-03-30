import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BASE_SIGNED_OUT_URL, IS_MAIN_INSTANCE } from "~/lib/constants";

export const Route = createFileRoute("/blog")({
  beforeLoad: () => {
    if (!IS_MAIN_INSTANCE) {
      throw redirect({ to: BASE_SIGNED_OUT_URL });
    }
  },
  component: BlogLayout,
});

function BlogLayout() {
  return (
    <main className="bg-background text-pretty">
      <div className="pt-8 pb-12 md:pt-12 md:pb-24">
        <Outlet />
      </div>
    </main>
  );
}
