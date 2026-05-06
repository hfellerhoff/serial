import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { RecentReleaseBanner } from "~/components/welcome/RecentReleaseBanner";
import { WebsiteNavigation } from "~/components/welcome/WebsiteNavigation";
import { IS_DEMO_INSTANCE } from "~/lib/demo";
import { getMostRecentRelease } from "~/lib/markdown/loaders";
import { fetchIsAuthed } from "~/server/auth/endpoints";

export const Route = createFileRoute("/_web")({
  component: RootLayout,
  loader: async () => {
    const isAuthed = await fetchIsAuthed();
    if (IS_DEMO_INSTANCE && !isAuthed) {
      throw redirect({ to: "/api/demo/provision" });
    }
    const mostRecentRelease = getMostRecentRelease();
    return { isAuthed, mostRecentRelease };
  },
});

function RootLayout() {
  const { isAuthed, mostRecentRelease } = Route.useLoaderData();

  return (
    <main className="bg-background text-pretty">
      <RecentReleaseBanner mostRecentRelease={mostRecentRelease} />
      <WebsiteNavigation isAuthed={isAuthed} />
      <div className="pt-8 pb-12 md:pt-12 md:pb-24">
        <Outlet />
      </div>
    </main>
  );
}
