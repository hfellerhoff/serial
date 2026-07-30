import * as Sentry from "@sentry/tanstackstart-react";
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
  const dsn = process.env.SENTRY_DSN_BACKEND;

  if (dsn) {
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "development",
    });
  }

  return {
    requestMiddleware: [
      csrfMiddleware,
      ...(dsn ? [sentryGlobalRequestMiddleware] : []),
    ],
    functionMiddleware: dsn ? [sentryGlobalFunctionMiddleware] : [],
  };
});
