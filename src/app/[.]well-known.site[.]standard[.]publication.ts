import { createFileRoute } from "@tanstack/react-router";
import { env } from "~/env";
import { IS_MAIN_INSTANCE } from "~/lib/constants";
import { createPublicationVerificationResponse } from "~/lib/standard-site";

export const Route = createFileRoute("/.well-known/site.standard.publication")({
  server: {
    handlers: {
      GET: () =>
        createPublicationVerificationResponse({
          isMainInstance: IS_MAIN_INSTANCE,
          publicationUri: env.VITE_PUBLIC_STANDARD_SITE_PUBLICATION_URI,
        }),
    },
  },
});
