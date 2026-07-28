import { defineCollection, reference, z } from "astro:content";
import { glob } from "astro/loaders";

const guides = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
    publish_date: z.string().date(),
    updated_at: z.string().date().optional(),
    public: z.boolean(),
  }),
});

const releases = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/releases" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    publish_date: z.string().date(),
    public: z.boolean(),
    og_screenshot: reference("media").optional(),
  }),
});

const media = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/media" }),
  schema: ({ image }) =>
    z.object({
      src: image(),
      alt: z.string(),
    }),
});

export const collections = { guides, releases, media };
