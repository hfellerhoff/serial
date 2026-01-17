import { ThemeProvider } from "~/components/ThemeProvider";
import { Toaster } from "~/components/ui/sonner";
import { TRPCReactProvider } from "~/trpc/react";

import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ApplyColorThemeOnServerMount } from "~/components/color-theme/ApplyColorThemeOnMount";
import { orpcRouterClient } from "~/lib/orpc";
import appCss from "~/styles/globals.css?url";
import { SproutIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { AUTH_SIGNED_IN_URL } from "~/server/auth/constants";

const title = "Serial";
const description =
  "A snappy, customizable video feed. Designed to show you exactly the content you want to see and nothing else.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: title },
      { name: "description", content: description },
      { name: "application-name", content: title },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: title },
      { name: "format-detection", content: "telephone=no" },
      {
        name: "keywords",
        content: "video, rss, newsletter, content, youtube, podcast",
      },
      { name: "author", content: "Henry Fellerhoff" },
      { name: "theme-color", content: "hsl(20 14.3% 4.1%)" },
      // Twitter
      { name: "twitter:card", content: "summary" },
      { name: "twitter:creator", content: "@henryfellerhoff" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      // Open Graph
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/masonry-preview.png" },
      { property: "og:image:alt", content: title },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/app.webmanifest" },
      { rel: "icon", href: "/favicon.ico" },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "512x512",
        href: "/android-chrome-512x512.png",
      },
      // YouTube preconnect hints for faster video loading
      { rel: "preconnect", href: "https://www.youtube-nocookie.com" },
      { rel: "preconnect", href: "https://i.ytimg.com" },
      { rel: "preconnect", href: "https://img.youtube.com" },
      { rel: "dns-prefetch", href: "https://www.youtube-nocookie.com" },
      // Preload YouTube IFrame API
      {
        rel: "preload",
        href: "https://www.youtube.com/iframe_api",
        as: "script",
      },
    ],
  }),
  component: RootLayout,
  staleTime: 1000 * 60 * 60 * 10,
  loader: async () => {
    const data = await orpcRouterClient.userConfig.getConfig();

    return {
      variables: data,
    };
  },
  notFoundComponent: () => (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 text-center">
      <SproutIcon size={36} className="text-foreground" />
      <div className="max-w-xs text-2xl font-semibold">
        Oops! We couldn't find what you're looking for.
      </div>
      <Button asChild>
        <Link to={AUTH_SIGNED_IN_URL}>Back to Home</Link>
      </Button>
    </div>
  ),
});

export function RootLayout() {
  const data = Route.useLoaderData();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* {process.env.NODE_ENV !== "production" && (
          <>
            <script
              crossOrigin="anonymous"
              src="//unpkg.com/react-scan/dist/auto.global.js"
            />
          </>
        )} */}
        {process.env.NODE_ENV === "production" && (
          <>
            <script
              async
              defer
              data-website-id="b65ad781-e11e-43e3-a53e-35e09c16709a"
              src="https://umami.henryfellerhoff.com/script.js"
            />
          </>
        )}
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body
        // className={cn(`min-h-screen font-sans antialiased ${inter.variable}`)}
        className="min-h-screen font-sans antialiased"
      >
        <ApplyColorThemeOnServerMount data={data.variables} />
        <TRPCReactProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Outlet />
            {/*TODO: what is happening here*/}
            <Scripts />
            <Toaster />
          </ThemeProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
