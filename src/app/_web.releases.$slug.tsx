import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { NotebookTextIcon } from "lucide-react";
import { Markdown } from "~/components/Markdown";
import { WebFooterCTA } from "~/components/welcome/WebFooterCTA";
import { env } from "~/env";
import { IS_MAIN_INSTANCE } from "~/lib/constants";
import { getReleaseWithSlug } from "~/lib/markdown/loaders";
import { buildReleaseMetadata } from "~/lib/og/releaseMetadata";
import {
  buildDocumentLink,
  buildReleaseDocumentSource,
} from "~/lib/standard-site";
import { fetchIsAuthed } from "~/server/auth/endpoints";

export const Route = createFileRoute("/_web/releases/$slug")({
  loader: async ({ params }) => {
    const isAuthed = await fetchIsAuthed();
    const release = getReleaseWithSlug(params.slug);
    return { release, isAuthed };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};

    const metadata = buildReleaseMetadata(
      loaderData.release,
      env.VITE_PUBLIC_BASE_URL,
    );
    const documentLink = buildDocumentLink(
      buildReleaseDocumentSource(loaderData.release),
      {
        isMainInstance: IS_MAIN_INSTANCE,
        publicationUri: env.VITE_PUBLIC_STANDARD_SITE_PUBLICATION_URI,
      },
    );

    return {
      ...metadata,
      links: documentLink ? [...metadata.links, documentLink] : metadata.links,
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { release } = Route.useLoaderData();

  return (
    <div>
      <article className="mx-auto max-w-3xl px-6 text-xl text-pretty">
        <div className="mx-auto mt-20 mb-12 max-w-2xl text-center text-balance">
          <div className="bg-muted mb-6 inline-flex items-center justify-center rounded-xl p-4">
            <NotebookTextIcon className="text-muted-foreground size-8" />
          </div>
          <h1 className="text-3xl leading-tight font-bold md:text-4xl">
            {release.title}
          </h1>
          {release.description && (
            <p className="mt-3 text-lg">{release.description}</p>
          )}
          <p className="text-muted-foreground mt-2 text-lg">
            {dayjs(release.publish_date).format("MMMM DD, YYYY")}
          </p>
        </div>
        <Markdown content={release.content} className="guides" />
      </article>
      <div className="mt-12 lg:mt-16" />
      <WebFooterCTA />
    </div>
  );
}
