import * as Sentry from "@sentry/tanstackstart-react";

const dsn = process.env.SENTRY_DSN_BACKEND;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    environment: process.env.NODE_ENV || "development",
  });
}
