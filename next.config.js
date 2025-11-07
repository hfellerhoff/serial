/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

import createWithPWA from "next-pwa";
import createWithMDX from "@next/mdx";

const withPWA = createWithPWA({
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  dest: "public",
  scope: "/",
  // fallbacks: {
  //   //image: "/static/images/fallback.png",
  //   // document: "/offline", // if you want to fallback to a custom page rather than /_offline
  //   // font: '/static/font/fallback.woff2',
  //   // audio: ...,
  //   // video: ...,
  // },
});

const withMDX = createWithMDX();

/** @type {import("next").NextConfig} */
const config = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  output: "standalone",
  transpilePackages: ["next-mdx-remote"],
  experimental: {
    reactCompiler: true,
  },
};

const isProd = process.env.NODE_ENV === "production";

const exportedConfig = isProd
  ? // @ts-expect-error - This is a NextJS config file
    withPWA(withMDX(config))
  : withMDX(config);

export default exportedConfig;
