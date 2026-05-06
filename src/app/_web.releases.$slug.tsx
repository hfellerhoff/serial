import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { NotebookTextIcon } from "lucide-react";
import { Markdown } from "~/components/Markdown";
import { WebFooterCTA } from "~/components/welcome/WebFooterCTA";
import { getReleaseWithSlug } from "~/lib/markdown/loaders";
import { fetchIsAuthed } from "~/server/auth/endpoints";

export const Route = createFileRoute("/_web/releases/$slug")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const isAuthed = await fetchIsAuthed();
    const release = getReleaseWithSlug(params.slug);
    return { release, isAuthed };
  },
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
