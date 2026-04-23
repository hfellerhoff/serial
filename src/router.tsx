import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  if (!router.isServer) {
    const dsn = import.meta.env.VITE_PUBLIC_SENTRY_DSN_WEB;
    if (dsn) {
      Sentry.init({
        dsn,
        sendDefaultPii: false,
        environment: import.meta.env.DEV ? "development" : "production",
      });
    }
  }

  return router;
}
