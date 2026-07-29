import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { provisionExtensionOAuthClient } from "~/server/auth/extension";
import { logMessage } from "~/server/logger";

const extensionClientProvisioning = await provisionExtensionOAuthClient();
if (extensionClientProvisioning !== "unchanged") {
  logMessage(
    `[auth] Extension OAuth client ${extensionClientProvisioning} during startup`,
  );
}

export default createServerEntry(
  wrapFetchWithSentry({
    fetch(request: Request) {
      return handler.fetch(request);
    },
  }),
);
