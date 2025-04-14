import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { KeyboardProvider } from "~/components/KeyboardProvider";
import { ScrollArea } from "~/components/ui/scroll-area";
import { AppDialogs } from "./feed/AppDialogs";
import { Header } from "./feed/Header";
import { ApplyColorTheme } from "~/components/color-theme/ApplyColorTheme";
import { Suspense } from "react";
import { ReleaseNotifier } from "~/components/releases/ReleaseNotifier";
import { InitialClientQueries } from "~/lib/data/InitialClientQueries";
import FeedLoading from "../loading";
import { isServerAuthed } from "~/server/auth";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { AppLeftSidebar, AppRightSidebar } from "~/components/app-sidebar";

const title = "Serial";
const description = "Your personal content newsletter";

export const metadata: Metadata = {
  title: title,
  applicationName: title,
  appleWebApp: {
    capable: true,
    title: title,
    startupImage: "/apple-touch-icon.png",
    statusBarStyle: "default",
  },
  description: description,
  formatDetection: {
    telephone: false,
  },
  generator: "Next.js",
  manifest: "/manifest.json",
  keywords: ["video", "rss", "newsletter", "content", "youtube", "podcast"],
  authors: [
    {
      name: "Henry Fellerhoff",
      url: "https://www.henryfellerhoff.com",
    },
  ],
  icons: [
    { rel: "icon", url: "/favicon.ico" },
    {
      rel: "icon",
      sizes: "16x16",
      type: "image/png",
      url: "/favicon-16x16.png",
    },
    {
      rel: "icon",
      sizes: "32x32",
      type: "image/png",
      url: "/favicon-32x32.png",
    },
    { rel: "apple-touch-icon", sizes: "180x180", url: "/apple-touch-icon.png" },
    {
      rel: "icon",
      type: "image/png",
      sizes: "512x512",
      url: "/android-chrome-512x512.png",
    },
  ],
  twitter: {
    card: "summary",
    creator: "@henryfellerhoff",
    title: title,
    description: description,
  },
  openGraph: {
    title: title,
    description: description,
    type: "website",
    images: [
      {
        url: "/icon-256.png",
        width: 256,
        height: 256,
        alt: title,
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { color: "hsl(20 14.3% 4.1%)" },
    // { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    // { media: "(prefers-color-scheme: dark)", color: "hsl(20 14.3% 4.1%)" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isServerAuthed())) {
    redirect("/auth");
  }

  return (
    <ApplyColorTheme>
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
            <KeyboardProvider>
              <AppLeftSidebar />
              <SidebarInset>
                <Header />
                <main className="flex flex-col">
                  <ScrollArea className="h-full w-full">
                    <div className="h-full w-full pb-6">{children}</div>
                  </ScrollArea>
                  <AppDialogs />
                </main>
                <ReleaseNotifier />
              </SidebarInset>
              <AppRightSidebar />
            </KeyboardProvider>
          </SidebarProvider>
        </InitialClientQueries>
      </Suspense>
    </ApplyColorTheme>
  );
}
