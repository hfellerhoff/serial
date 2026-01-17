import { createFileRoute, Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { getAllReleases } from "~/lib/markdown/loaders";
import { fetchIsAuthed } from "~/server/auth/endpoints";

export const Route = createFileRoute("/_web/releases/")({
  component: RouteComponent,
  loader: async () => {
    const isAuthed = await fetchIsAuthed();

    return {
      isAuthed,
      releases: getAllReleases(),
    };
  },
});

function RouteComponent() {
  const { isAuthed, releases } = Route.useLoaderData();

  return (
    <div>
      <p>
        <Link to={isAuthed ? "/" : "/welcome"}>
          ⭠ Back to {isAuthed ? "App" : "Home"}
        </Link>
      </p>
      <h1>Releases</h1>
      <ul className="list-none space-y-8 p-0 pt-4">
        {!releases.length && <p>Nothing to see here. Check back soon!</p>}
        {releases.map(({ slug, title, description, publish_date }) => {
          return (
            <li key={slug}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <Link
                  // @ts-expect-error this is fine
                  to={`/releases/${slug}`}
                  className="text-lg"
                  preload="viewport"
                >
                  {title}
                </Link>
                <p className="text-md text-muted-foreground font-semibold">
                  {dayjs(publish_date).format("MMMM DD, YYYY")}
                </p>
              </div>
              <p>{description}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
