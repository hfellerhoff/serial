import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { z } from "zod";
import { getMediaImageDataUrl, renderOgImage } from "../src/lib/og";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const contentRoot = join(projectRoot, "src", "content");
const outputRoot = join(projectRoot, "public", "og");

const CONTENT_TYPES = ["guides", "releases"] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

const ogFrontmatterSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  publish_date: z.string(),
  public: z.boolean(),
  og_screenshot: z.string().optional(),
});

function contentTypeForPath(markdownPath: string): ContentType | undefined {
  const relativePath = relative(contentRoot, markdownPath);
  return CONTENT_TYPES.find((type) =>
    relativePath.startsWith(`${type}/`),
  );
}

async function generateForFile(markdownPath: string) {
  const contentType = contentTypeForPath(markdownPath);
  if (!contentType) {
    throw new Error(`Not a known content file: ${markdownPath}`);
  }

  const slug = basename(markdownPath, ".md");
  const outputPath = join(outputRoot, contentType, `${slug}.png`);

  const source = await readFile(markdownPath, "utf8").catch(() => undefined);
  if (source === undefined) {
    await rm(outputPath, { force: true });
    console.log(`removed og/${contentType}/${slug}.png (source deleted)`);
    return;
  }

  const frontmatter = ogFrontmatterSchema.parse(matter(source).data);

  if (!frontmatter.public) {
    await rm(outputPath, { force: true });
    console.log(`skipped ${contentType}/${slug} (not public)`);
    return;
  }

  const image = await renderOgImage(
    {
      title: frontmatter.title,
      description: frontmatter.description,
      publish_date: frontmatter.publish_date,
    },
    frontmatter.og_screenshot
      ? getMediaImageDataUrl(frontmatter.og_screenshot)
      : undefined,
  );

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, image);
  console.log(`wrote ${relative(projectRoot, outputPath)}`);
}

async function generateAll() {
  for (const contentType of CONTENT_TYPES) {
    const entries = await readdir(join(contentRoot, contentType));
    const markdownFiles = entries.filter((entry) => entry.endsWith(".md"));

    // Remove images whose source markdown no longer exists.
    const outputDir = join(outputRoot, contentType);
    const existingImages = await readdir(outputDir).catch(() => []);
    const expectedImages = new Set(
      markdownFiles.map((file) => `${basename(file, ".md")}.png`),
    );
    for (const image of existingImages) {
      if (!expectedImages.has(image)) {
        await rm(join(outputDir, image));
        console.log(`removed stale og/${contentType}/${image}`);
      }
    }

    for (const file of markdownFiles) {
      await generateForFile(join(contentRoot, contentType, file));
    }
  }
}

const fileArguments = process.argv.slice(2).map((path) => resolve(path));

if (fileArguments.length === 0) {
  await generateAll();
} else {
  for (const markdownPath of fileArguments) {
    await generateForFile(markdownPath);
  }
}
