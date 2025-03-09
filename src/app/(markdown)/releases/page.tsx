import Link from "next/link";
import { getReleasePages } from "~/lib/markdown/releases";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const releases = await getReleasePages();

  return (
    <div>
      <p>
        <Link href="welcome">⭠ Back to Home</Link>
      </p>
      <h1>Releases</h1>
      <ul className="list-none space-y-16 p-0 pt-4">
        {!releases.length && <p>Nothing to see here. Check back soon!</p>}
        {releases.map(({ slug, frontmatter, content }) => {
          return (
            <li key={slug}>
              <p className="font-mono">{frontmatter.publish_date}</p>
              <Link
                href={`/releases/${slug}`}
                className="text-base leading-relaxed font-bold lg:text-lg lg:leading-loose"
              >
                {frontmatter.title}
              </Link>
              <p>{frontmatter.description}</p>
              <div className="pt-4">{content}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
