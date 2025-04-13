import "~/styles/globals.css";

import { Inter } from "next/font/google";

import { type Metadata, type Viewport } from "next";
import { ThemeProvider } from "~/components/ThemeProvider";
import { cn } from "~/lib/utils";
import { TRPCReactProvider } from "~/trpc/react";
import { Toaster } from "~/components/ui/sonner";
import { ApplyColorTheme } from "~/components/color-theme/ApplyColorTheme";
import { Suspense } from "react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

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
        url: "/masonry-preview.png",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
      </head>
      <body
        className={cn(`min-h-screen font-sans antialiased ${inter.variable}`)}
      >
        <TRPCReactProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ApplyColorTheme>
              <Suspense>{children}</Suspense>
              <Toaster />
            </ApplyColorTheme>
          </ThemeProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
