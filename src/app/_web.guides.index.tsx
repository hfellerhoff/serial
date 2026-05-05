import { createFileRoute, Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { BookIcon } from "lucide-react";
import { WebsiteHeader } from "~/components/welcome/WebsiteHeader";
import { getAllGuidePosts } from "~/lib/markdown/loaders";
import { fetchIsAuthed } from "~/server/auth/endpoints";

export const Route = createFileRoute("/_web/guides/")({
  component: RouteComponent,
  loader: async () => {
    const isAuthed = await fetchIsAuthed();

    return {
      isAuthed,
      posts: getAllGuidePosts(),
    };
  },
});

function RouteComponent() {
  const { posts } = Route.useLoaderData();

  return (
    <div>
      <WebsiteHeader
        Icon={BookIcon}
        title="Guides"
        description="Walkthroughs for both the main Serial instance and self-hosted Serial instances."
      />
      <div className="mx-auto max-w-3xl px-6">
        <ul className="mt-8 list-none space-y-8 p-0">
          {!posts.length && (
            <p className="text-xl">Nothing to see here. Check back soon!</p>
          )}
          {posts.map(({ slug, title, description, publish_date }) => {
            return (
              <li key={slug}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <Link
                    // @ts-expect-error this is fine
                    to={`/guides/${slug}`}
                    className="text-xl font-bold underline"
                    preload="intent"
                  >
                    {title}
                  </Link>
                  <p className="text-muted-foreground text-lg font-semibold">
                    {dayjs(publish_date).format("MMMM DD, YYYY")}
                  </p>
                </div>
                {description && <p className="mt-2 text-lg">{description}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
