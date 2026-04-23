import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { SproutIcon } from "lucide-react";
import { ThemeProvider } from "~/components/ThemeProvider";
import { Toaster } from "~/components/ui/sonner";
import { QueryProvider } from "~/lib/query-provider";
import { ReloadPrompt } from "~/components/pwa/ReloadPrompt";
import { Button } from "~/components/ui/button";
import { BASE_SIGNED_OUT_URL } from "~/lib/constants";
import { fetchConfigCss } from "~/server/auth/endpoints";

import appCss from "~/styles/globals.css?url";

import "@fontsource-variable/outfit";
import "@fontsource-variable/noto-serif";

const title = "Serial";
const description =
  "A snappy, customizable video feed. Designed to show you exactly the content you want to see and nothing else.";

export const Route = createRootRoute({
  loader: async () => {
    const configCss = await fetchConfigCss();
    return { configCss };
  },
  head: ({ loaderData }) => ({
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
      { rel: "manifest", href: "/manifest.webmanifest" },
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
    styles: loaderData?.configCss ? [{ children: loaderData.configCss }] : [],
  }),
  component: RootLayout,
  notFoundComponent: () => (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 text-center">
      <SproutIcon size={36} className="text-foreground" />
      <div className="max-w-xs text-2xl font-semibold">
        Oops! We couldn&apos;t find what you&apos;re looking for.
      </div>
      <Button asChild>
        <Link to={BASE_SIGNED_OUT_URL}>Back to Home</Link>
      </Button>
    </div>
  ),
});

export function RootLayout() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* {import.meta.env.DEV && (
          <>
            <script
              crossOrigin="anonymous"
              src="//unpkg.com/react-scan/dist/auto.global.js"
            />
          </>
        )}*/}
        {import.meta.env.VITE_PUBLIC_UMAMI_SRC &&
          import.meta.env.VITE_PUBLIC_UMAMI_WEBSITE_ID && (
            <>
              <script
                async
                defer
                data-website-id={import.meta.env.VITE_PUBLIC_UMAMI_WEBSITE_ID}
                src={import.meta.env.VITE_PUBLIC_UMAMI_SRC}
              />
            </>
          )}
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Outlet />
            {/* TODO: what is happening here */}
            <Scripts />
            <Toaster />
            <ReloadPrompt />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
