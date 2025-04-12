import type { Metadata } from "next";
import Link from "next/link";
import {
  readContentPage,
  getPublishedReleaseSlugs,
} from "~/lib/markdown/releases";
import { getServerAuth } from "~/server/auth";

type Params = Promise<{ slug: string | string[] }>;
async function getSlugFromParams(params: Params) {
  const { slug } = await params;

  if (Array.isArray(slug)) {
    return slug;
  }
  return [slug];
}

export async function generateMetadata({ params }: { params: Params }) {
  const slug = await getSlugFromParams(params);
  const { frontmatter } = await readContentPage("releases", slug);
  const metadata: Metadata = {
    title: `${frontmatter.title}`,
    description: frontmatter.description,
    openGraph: {
      siteName: "MDX on Next.js 14",
    },
  };

  if (frontmatter.og_image)
    metadata.openGraph!.images = [
      {
        url: frontmatter.og_image,
        width: 1200,
        height: 630,
        alt: "",
      },
    ];
  else
    metadata.openGraph!.images = [
      {
        url: `api/og?title=${frontmatter.title}&description=${frontmatter.description}`,
        width: 1200,
        height: 630,
      },
    ];

  return metadata;
}

export const dynamicParams = false;
export async function generateStaticParams() {
  return await getPublishedReleaseSlugs();
}

export default async function Page({ params }: { params: Params }) {
  const slug = await getSlugFromParams(params);
  const { content, frontmatter } = await readContentPage("releases", slug);

  const authData = await getServerAuth();

  return (
    <div>
      <div className="flex items-center justify-between pb-6">
        <Link href="/releases">⭠ All Releases</Link>
      </div>
      <p className="pb-0 font-mono">{frontmatter.publish_date}</p>
      <h2>{frontmatter.title}</h2>
      <p>{frontmatter.description}</p>
      <hr />
      {content}

      {!!authData?.session.id && (
        <>
          <p className="pt-6 pb-2">
            Thanks for checking out the release log! If you have any questions
            or feedback, feel free to send me an email at{" "}
            <a href="mailto:hey@serial.tube?subject=Question%20about%20serial.tube">
              hey@serial.tube
            </a>
            .
          </p>
          <Link href="/feed">Return to the app →</Link>
        </>
      )}
      {!authData?.session.id && (
        <>
          <p className="pt-6 pb-1">
            Thanks for checking out the release log! If you think Serial would
            be a great fit for you, you can{" "}
            <Link href="/feed">sign up here</Link>.
          </p>
        </>
      )}
    </div>
  );
}
