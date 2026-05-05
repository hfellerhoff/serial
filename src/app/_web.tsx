import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RecentReleaseBanner } from "~/components/welcome/RecentReleaseBanner";
import { WebsiteNavigation } from "~/components/welcome/WebsiteNavigation";
import { getMostRecentRelease } from "~/lib/markdown/loaders";
import { fetchIsAuthed } from "~/server/auth/endpoints";

export const Route = createFileRoute("/_web")({
  component: RootLayout,
  loader: async () => {
    const isAuthed = await fetchIsAuthed();
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
