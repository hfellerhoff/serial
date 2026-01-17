import "~/styles/globals.css";

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { AppLeftSidebar, AppRightSidebar } from "~/components/app-sidebar";
import { ReleaseNotifier } from "~/components/releases/ReleaseNotifier";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { InitialClientQueries } from "~/lib/data/InitialClientQueries";
import { authMiddleware } from "~/server/auth";
import { AppDialogs } from "../components/feed/AppDialogs";
import { Header } from "../components/feed/Header";
import FeedLoading from "../components/loading";
import { getMostRecentRelease } from "~/lib/markdown/loaders";

export const Route = createFileRoute("/_app")({
  component: RootLayout,
  server: {
    middleware: [authMiddleware],
  },
  loader: async () => {
    const mostRecentRelease = getMostRecentRelease();
    return { mostRecentRelease };
  },
});

function RootLayout() {
  const { mostRecentRelease } = Route.useLoaderData();

  return (
    // <ApplyColorTheme>
    <Suspense fallback={<FeedLoading />}>
      <InitialClientQueries>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 72)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
          }
        >
          <AppLeftSidebar />
          <SidebarInset>
            <Header />
            <main className="flex flex-col">
              <div className="h-full w-full pb-6">
                <Outlet />
              </div>
              <AppDialogs />
            </main>
            <ReleaseNotifier mostRecentRelease={mostRecentRelease} />
          </SidebarInset>
          <AppRightSidebar />
        </SidebarProvider>
      </InitialClientQueries>
    </Suspense>
    // </ApplyColorTheme>
  );
}
