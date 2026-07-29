import rss from "@astrojs/rss";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { render } from "astro:content";
import sanitizeHtml from "sanitize-html";
import { getAllReleases } from "../../lib/content";

function resolveSiteUrl(site, value) {
  if (!value || !value.startsWith("/")) return value;
  return new URL(value, site).toString();
}

function resolveAttribute(site, attribute) {
  return (tagName, attributes) => ({
    tagName,
    attribs: {
      ...attributes,
      [attribute]: resolveSiteUrl(site, attributes[attribute]),
    },
  });
}

export async function GET(context) {
  const container = await AstroContainer.create();
  const releases = await getAllReleases();

  const items = await Promise.all(
    releases.map(async (release) => {
      const { Content } = await render(release);
      const content = await container.renderToString(Content);

      return {
        title: release.data.title,
        description: release.data.description,
        pubDate: new Date(`${release.data.publish_date}T00:00:00Z`),
        link: new URL(`/releases/${release.id}/`, context.site).toString(),
        content: sanitizeHtml(content, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            "img",
            "figure",
            "figcaption",
          ]),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ["src", "alt", "width", "height"],
          },
          transformTags: {
            a: resolveAttribute(context.site, "href"),
            img: resolveAttribute(context.site, "src"),
          },
        }),
      };
    }),
  );

  return rss({
    title: "Serial Releases",
    description: "Release notes and product updates from Serial.",
    site: new URL("/releases/", context.site),
    items,
    customData: "<language>en-us</language>",
  });
}
