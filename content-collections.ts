// content-collections.ts
import { defineCollection, defineConfig } from "@content-collections/core";
import matter from "gray-matter";
import z from "zod";

function extractFrontMatter(content: string) {
  const { data, content: body, excerpt } = matter(content, { excerpt: true });
  return { data, body, excerpt: excerpt || "" };
}

const markdownReleaseSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  publish_date: z.string().date(),
  public: z.boolean(),
});

export const releaseSchema = markdownReleaseSchema.extend({
  slug: z.string(),
  content: z.string(),
  excerpt: z.string(),
});

export type Release = z.infer<typeof releaseSchema>;

const releases = defineCollection({
  name: "releases",
  directory: "./src/content/releases", // Directory containing your .md files
  include: "*.md",
  schema: markdownReleaseSchema,
  transform: ({ content, ...post }) => {
    const frontMatter = extractFrontMatter(content);

    return {
      ...post,
      slug: post._meta.path,
      excerpt: frontMatter.excerpt,
      content: frontMatter.body,
    };
  },
});

export default defineConfig({
  collections: [releases],
});
