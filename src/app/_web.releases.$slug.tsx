import { createFileRoute, Link } from "@tanstack/react-router";
import { Markdown } from "~/components/Markdown";
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
  const { release, isAuthed } = Route.useLoaderData();

  return (
    <article>
      <div className="flex items-center justify-between pb-6">
        {isAuthed && (
          <>
            <Link to="/">⭠ Back to App</Link>
            <Link to="/releases">↑ All Releases</Link>
          </>
        )}
        {!isAuthed && (
          <>
            <Link to="/welcome">⭠ Back to Home</Link>
            <Link to="/releases">↑ All Releases</Link>
          </>
        )}
      </div>
      <p className="pb-0 font-sans">{release.publish_date}</p>
      <h2>{release.title}</h2>
      <p>{release.description}</p>
      <hr />
      <Markdown content={release.content} className="prose" />
      {isAuthed && (
        <>
          <p className="pt-6 pb-2">
            Thanks for checking out the release log! If you have any questions
            or feedback, feel free to send me an email at{" "}
            <a href="mailto:hey@serial.tube?subject=Question%20about%20serial.tube">
              hey@serial.tube
            </a>
            .
          </p>
          <Link to="/">Return to the app →</Link>
        </>
      )}
      {!isAuthed && (
        <>
          <p className="pt-6 pb-1">
            Thanks for checking out the release log! If you think Serial would
            be a great fit for you, you can{" "}
            <Link to="/auth/sign-up">sign up here</Link>.
          </p>
        </>
      )}
    </article>
  );
}
