import "~/styles/globals.css";

import { Inter } from "next/font/google";

import { type Metadata, type Viewport } from "next";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="prose mx-auto p-6 pb-16 sm:p-8 md:p-10 lg:p-12">
      {children}
    </div>
  );
}
