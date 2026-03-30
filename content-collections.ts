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
  content: z.string(),
});

export const releaseSchema = markdownReleaseSchema.extend({
  slug: z.string(),
  excerpt: z.string(),
});

export type Release = z.infer<typeof releaseSchema>;

const markdownBlogPostSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  publish_date: z.string().date(),
  updated_at: z.string().date().optional(),
  public: z.boolean(),
  content: z.string(),
});

export const blogPostSchema = markdownBlogPostSchema.extend({
  slug: z.string(),
  excerpt: z.string(),
});

export type BlogPost = z.infer<typeof blogPostSchema>;

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

const blogPosts = defineCollection({
  name: "blogPosts",
  directory: "./src/content/blog",
  include: "*.md",
  schema: markdownBlogPostSchema,
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
  collections: [releases, blogPosts],
});
