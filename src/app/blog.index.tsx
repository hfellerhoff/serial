import { createFileRoute, Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { DemoColorThemePopoverButton } from "~/components/color-theme/ColorThemePopoverButton";
import { getAllBlogPosts } from "~/lib/markdown/loaders";
import { fetchIsAuthed } from "~/server/auth/endpoints";

export const Route = createFileRoute("/blog/")({
  component: RouteComponent,
  loader: async () => {
    const isAuthed = await fetchIsAuthed();

    return {
      isAuthed,
      posts: getAllBlogPosts(),
    };
  },
});

function RouteComponent() {
  const { isAuthed, posts } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-3xl px-6">
      <div className="relative flex items-center justify-between text-lg font-semibold">
        <Link
          to={isAuthed ? "/" : "/welcome"}
          className="hover:bg-primary hover:text-background -m-1 rounded p-1"
        >
          ← Back to {isAuthed ? "App" : "Home"}
        </Link>
        <div className="absolute left-1/2 -translate-x-1/2">
          <DemoColorThemePopoverButton />
        </div>
      </div>
      <h1 className="mt-16 text-3xl font-bold md:text-4xl">Blog</h1>
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
                  to={`/blog/${slug}`}
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
  );
}
