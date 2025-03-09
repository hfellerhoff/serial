import path from "node:path";
import fs from "node:fs/promises";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";

type Frontmatter = {
  title: string;
  description: string;
  publish_date: string;
  public?: boolean;
  og_image?: string;
};

async function getSlugsForReleases() {
  const app = path.join(process.cwd(), "src/content/releases");
  const files = await fs.readdir(app, { withFileTypes: true });

  const pathsInReleases = files.map((file) => file.name);
  const slugs = pathsInReleases
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""))
    .map((slug) => ({ slug }))
    .sort((a, b) => b.slug.localeCompare(a.slug));

  return slugs;
}

export async function getPublishedReleaseSlugs() {
  const releases = await getReleasePages();
  const publicReleases = releases.filter(
    (release) => release.frontmatter.public !== false,
  );

  return publicReleases.map((release) => ({ slug: release.slug }));
}

export async function getReleasePages() {
  const slugs = await getSlugsForReleases();

  const releasePromises = slugs.map(async (slug) => {
    const { frontmatter, content } = await readContentPage("releases", [
      slug.slug,
    ]);
    return { slug: slug.slug, frontmatter, content };
  });
  const releases = await Promise.all(releasePromises);

  return releases.filter((release) => release.frontmatter.public !== false);
}

export async function readContentPage(directory: string, slug: string[]) {
  try {
    const filePath =
      path.join(process.cwd(), "src/content", directory, ...slug) + ".md";
    const page = await fs.readFile(filePath, "utf8");

    const { content, frontmatter } = await compileMDX<Frontmatter>({
      source: page,
      // Add any components you want to use
      // components: {},
      options: {
        parseFrontmatter: true,
      },
    });

    return { content, frontmatter };
  } catch (error) {
    console.log(error);
    notFound();
  }
}
