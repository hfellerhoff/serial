// @ts-check
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";

// Regenerates the pre-rendered OG images in public/og/ whenever a content
// markdown file is saved during `astro dev`. Runs the generator in a
// subprocess so satori/sharp stay out of the dev server process.
function ogImageWatcher() {
  const projectDir = fileURLToPath(new URL(".", import.meta.url));
  const contentDir = fileURLToPath(new URL("./src/content/", import.meta.url));
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const pending = new Map();

  return /** @type {import("astro").AstroIntegration} */ ({
    name: "og-image-watcher",
    hooks: {
      "astro:server:setup": ({ server, logger }) => {
        /** @param {string} filePath */
        const regenerate = (filePath) => {
          if (!filePath.startsWith(contentDir) || !filePath.endsWith(".md")) {
            return;
          }
          clearTimeout(pending.get(filePath));
          pending.set(
            filePath,
            setTimeout(() => {
              pending.delete(filePath);
              const child = spawn(
                process.execPath,
                ["--import", "tsx", "./scripts/generate-og-images.ts", filePath],
                { cwd: projectDir },
              );
              child.stdout.on("data", (data) => logger.info(String(data).trim()));
              child.stderr.on("data", (data) => logger.error(String(data).trim()));
            }, 300),
          );
        };
        server.watcher.on("add", regenerate);
        server.watcher.on("change", regenerate);
        server.watcher.on("unlink", regenerate);
      },
    },
  });
}

export default defineConfig({
  site: "https://www.serial.tube",
  output: "static",
  integrations: [ogImageWatcher()],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  markdown: {
    rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
