import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import dayjs from "dayjs";
import satori from "satori";
import sharp from "sharp";
import { parse } from "yaml";

// This module is consumed by scripts/generate-og-images.ts under plain Node
// (via tsx), so assets are read from disk rather than through Vite imports.
function readAssetDataUrl(relativePath: string, mimeType: string) {
  const data = readFileSync(new URL(relativePath, import.meta.url));
  return `data:${mimeType};base64,${data.toString("base64")}`;
}

const serialLogoDataUrl = readAssetDataUrl(
  "../../public/icon-256.png",
  "image/png",
);
const defaultScreenshotDataUrl = readAssetDataUrl(
  "../../public/welcome/screenshot-desktop-light.jpeg",
  "image/jpeg",
);

export type OgContentData = {
  title: string;
  description?: string;
  publish_date: string;
};

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

const OG_COLORS = {
  background: "#ffffff",
  foreground: "#1d1b1a",
  muted: "#f5f5f3",
  mutedForeground: "#777777",
} as const;

const OG_TEXT_LIMITS = {
  title: 72,
  description: 150,
} as const;

const OG_LAYOUT = {
  edge: 48,
  releaseIconSize: 64,
  screenshotHeight: 946 / (16 / 9),
  screenshotLeft: 399,
  screenshotWidth: 946,
  textWidth: 303,
} as const;

const OUTFIT_FONTS = {
  regular: readFileSync(new URL("../assets/og/Outfit-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../assets/og/Outfit-Bold.ttf", import.meta.url)),
} as const;

function truncateText(text: string, maximumLength: number) {
  if (text.length <= maximumLength) return text;

  const truncatedText = text.slice(0, maximumLength - 1).trimEnd();
  return `${truncatedText}…`;
}

// Satori accepts plain React-shaped element objects; this avoids JSX here.
type SatoriNode = {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
};

function element(
  type: string,
  props: Record<string, unknown>,
  ...children: unknown[]
): SatoriNode {
  const normalizedChildren =
    children.length === 0
      ? undefined
      : children.length === 1
        ? children[0]
        : children;
  return { type, props: { ...props, children: normalizedChildren } };
}

// lucide notebook-text, rendered as a static SVG node tree.
function notebookTextIcon() {
  const paths = [
    "M2 6h4",
    "M2 10h4",
    "M2 14h4",
    "M2 18h4",
    "M9.5 8h5",
    "M9.5 12H16",
    "M9.5 16H14",
  ];
  return element(
    "svg",
    {
      width: "52",
      height: "52",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: OG_COLORS.mutedForeground,
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    ...paths.map((d) => element("path", { d })),
    element("rect", { width: "16", height: "20", x: "4", y: "2", rx: "2" }),
  );
}

function getOgTypography(title: string, description?: string) {
  const combinedLength = title.length + (description?.length ?? 0);

  if (title.length > 48 || combinedLength > 155) {
    return { descriptionFontSize: 18, titleFontSize: 36 } as const;
  }

  if (title.length > 30 || combinedLength > 100) {
    return { descriptionFontSize: 20, titleFontSize: 42 } as const;
  }

  return { descriptionFontSize: 22, titleFontSize: 48 } as const;
}

function buildOgTree(content: OgContentData, screenshotDataUrl?: string) {
  const title = truncateText(content.title, OG_TEXT_LIMITS.title);
  const description = content.description
    ? truncateText(content.description, OG_TEXT_LIMITS.description)
    : undefined;
  const typography = getOgTypography(title, description);

  return element(
    "div",
    {
      style: {
        backgroundColor: OG_COLORS.background,
        color: OG_COLORS.foreground,
        display: "flex",
        fontFamily: "Outfit",
        height: "100%",
        position: "relative",
        width: "100%",
      },
    },
    element(
      "div",
      {
        style: {
          alignItems: "center",
          backgroundColor: OG_COLORS.muted,
          borderRadius: "16px",
          display: "flex",
          height: OG_LAYOUT.releaseIconSize,
          justifyContent: "center",
          left: OG_LAYOUT.edge,
          position: "absolute",
          top: OG_LAYOUT.edge,
          width: OG_LAYOUT.releaseIconSize,
        },
      },
      element(
        "div",
        { style: { display: "flex", transform: "scale(0.75)" } },
        notebookTextIcon(),
      ),
    ),
    element(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          left: OG_LAYOUT.edge,
          position: "absolute",
          top: "176px",
          width: `${OG_LAYOUT.textWidth}px`,
        },
      },
      element(
        "div",
        {
          style: {
            color: OG_COLORS.mutedForeground,
            display: "flex",
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "1.4px",
            lineHeight: 1.2,
            textTransform: "uppercase",
          },
        },
        dayjs(content.publish_date).format("MMMM D, YYYY"),
      ),
      element(
        "div",
        {
          style: {
            display: "flex",
            fontSize: `${typography.titleFontSize}px`,
            fontWeight: 700,
            letterSpacing: "-1.2px",
            lineHeight: 1.02,
            marginTop: "16px",
          },
        },
        title,
      ),
      ...(description
        ? [
            element(
              "div",
              {
                style: {
                  color: OG_COLORS.mutedForeground,
                  display: "flex",
                  fontSize: `${typography.descriptionFontSize}px`,
                  lineHeight: 1.18,
                  marginTop: "14px",
                },
              },
              description,
            ),
          ]
        : []),
    ),
    element(
      "div",
      {
        style: {
          borderRadius: "16px",
          boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.2)",
          display: "flex",
          height: `${OG_LAYOUT.screenshotHeight}px`,
          left: `${OG_LAYOUT.screenshotLeft}px`,
          overflow: "hidden",
          position: "absolute",
          top: `${OG_LAYOUT.edge}px`,
          width: `${OG_LAYOUT.screenshotWidth}px`,
        },
      },
      element("img", {
        src: screenshotDataUrl ?? defaultScreenshotDataUrl,
        alt: "",
        width: OG_LAYOUT.screenshotWidth,
        height: OG_LAYOUT.screenshotHeight,
        style: {
          borderRadius: "16px",
          height: OG_LAYOUT.screenshotHeight,
          objectFit: "cover",
          width: OG_LAYOUT.screenshotWidth,
        },
      }),
    ),
    element(
      "div",
      {
        style: {
          alignItems: "center",
          bottom: "36px",
          display: "flex",
          fontSize: "24px",
          fontWeight: 700,
          gap: "10px",
          left: `${OG_LAYOUT.edge}px`,
          letterSpacing: "0.5px",
          position: "absolute",
        },
      },
      element("img", {
        src: serialLogoDataUrl,
        alt: "",
        width: 32,
        height: 32,
        style: { borderRadius: "8px", height: 32, width: 32 },
      }),
      "Serial",
    ),
  );
}

const MEDIA_IMAGE_MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
};

export function getMediaImageDataUrl(mediaId: string) {
  const metadataUrl = new URL(`../media/${mediaId}.yaml`, import.meta.url);
  if (!existsSync(metadataUrl)) {
    throw new Error(`Media library entry "${mediaId}" does not exist`);
  }

  const metadata = parse(readFileSync(metadataUrl, "utf8")) as unknown;
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("src" in metadata) ||
    typeof metadata.src !== "string"
  ) {
    throw new Error(`Media library entry "${mediaId}" has no image source`);
  }

  const imageUrl = new URL(metadata.src, metadataUrl);
  if (!existsSync(imageUrl)) {
    throw new Error(`Image for media library entry "${mediaId}" does not exist`);
  }

  const extension = extname(fileURLToPath(imageUrl)).toLowerCase();
  const mimeType = MEDIA_IMAGE_MIME_TYPES[extension];
  if (!mimeType) {
    throw new Error(
      `Image for media library entry "${mediaId}" has an unsupported format`,
    );
  }

  const data = readFileSync(imageUrl);
  return `data:${mimeType};base64,${data.toString("base64")}`;
}

export async function renderOgImage(
  content: OgContentData,
  screenshotDataUrl?: string,
) {
  const svg = await satori(buildOgTree(content, screenshotDataUrl) as never, {
    ...OG_IMAGE_SIZE,
    fonts: [
      {
        name: "Outfit",
        data: OUTFIT_FONTS.regular,
        weight: 400,
        style: "normal",
      },
      {
        name: "Outfit",
        data: OUTFIT_FONTS.bold,
        weight: 700,
        style: "normal",
      },
    ],
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}
