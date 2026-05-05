import { createFileRoute, Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { BookOpenIcon, PenLineIcon, RssIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { YoutubeIcon } from "~/components/brand-icons";
import { Markdown } from "~/components/Markdown";
import { Button } from "~/components/ui/button";
import { getGuidePostWithSlug } from "~/lib/markdown/loaders";
import { fetchIsAuthed } from "~/server/auth/endpoints";

export const Route = createFileRoute("/_web/guides/$slug")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const isAuthed = await fetchIsAuthed();
    const post = getGuidePostWithSlug(params.slug);
    return { post, isAuthed };
  },
});

const GUIDE_ICONS: Record<string, LucideIcon | typeof YoutubeIcon> = {
  youtube: YoutubeIcon,
  rss: RssIcon,
  "book-open": BookOpenIcon,
  "pen-line": PenLineIcon,
};

function GuideIcon({ name }: { name: string }) {
  const Icon = GUIDE_ICONS[name];
  if (!Icon) return null;

  return (
    <div className="bg-muted mb-6 inline-flex items-center justify-center rounded-xl p-4">
      <Icon className="text-muted-foreground size-8" />
    </div>
  );
}

function RouteComponent() {
  const { post } = Route.useLoaderData();

  return (
    <div>
      <article className="mx-auto max-w-3xl px-6 text-xl text-pretty">
        <div className="mx-auto mt-20 mb-12 max-w-2xl text-center text-balance">
          {post.icon && <GuideIcon name={post.icon} />}
          <h1 className="text-3xl leading-tight font-bold md:text-4xl">
            {post.title}
          </h1>
          {post.description && (
            <p className="mt-3 text-lg">{post.description}</p>
          )}
          <p className="text-muted-foreground mt-2 text-lg">
            {dayjs(post.publish_date).format("MMMM DD, YYYY")}
            {post.updated_at && (
              <span className="ml-2">
                ·
                <span className="ml-2">
                  Updated {dayjs(post.updated_at).format("MMMM DD, YYYY")}
                </span>
              </span>
            )}
          </p>
        </div>
        <Markdown content={post.content} className="guides" />
      </article>
      <div className="border-foreground mx-auto mt-16 max-w-4xl border-4 border-x-0 border-dashed px-6 py-16 md:border-x-4">
        <section className="relative mx-auto max-w-xl space-y-6 text-center text-2xl text-pretty md:py-16 md:text-3xl">
          <p>Ready to take back control of your content?</p>
          <div className="space-x-2">
            <Link to="/auth/sign-up">
              <Button size="lg" className="text-base">
                Get Started
              </Button>
            </Link>
            <Link to="/welcome">
              <Button size="lg" className="text-base" variant="outline">
                Learn More
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
