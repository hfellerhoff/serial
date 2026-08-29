import { readFile } from "node:fs/promises";
import path from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const SERVICE_WORKER_PATH = path.resolve(process.cwd(), ".output/public/sw.js");

export const Route = createFileRoute("/sw.js")({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.NODE_ENV !== "production") {
          return new Response("Not Found", { status: 404 });
        }

        const serviceWorker = await readFile(SERVICE_WORKER_PATH, "utf8");

        return new Response(serviceWorker, {
          headers: {
            "Cache-Control": "no-cache",
            "Content-Type": "application/javascript; charset=utf-8",
            "Service-Worker-Allowed": "/",
          },
        });
      },
    },
  },
});
