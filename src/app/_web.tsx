import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_web")({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="prose mx-auto p-6 pb-16 sm:p-8 md:p-10 lg:p-12">
      <Outlet />
    </div>
  );
}
