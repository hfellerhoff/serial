import dayjs from "dayjs";
import satori from "satori";
import sharp from "sharp";
import serialLogoDataUrl from "../../../public/icon-256.png?inline";
import defaultScreenshotDataUrl from "../../../public/welcome/screenshot-desktop-light.jpeg?inline";
import outfitBoldDataUrl from "./assets/Outfit-Bold.ttf?inline";
import outfitRegularDataUrl from "./assets/Outfit-Regular.ttf?inline";

import type { Release } from "content-collections";

type ReleaseOgData = Pick<
  Release,
  "description" | "publish_date" | "slug" | "title"
>;

export const RELEASE_OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

const RELEASE_OG_COLORS = {
  background: "#ffffff",
  foreground: "#1d1b1a",
  muted: "#f5f5f3",
  mutedForeground: "#777777",
} as const;

const RELEASE_OG_TEXT_LIMITS = {
  title: 72,
  description: 150,
} as const;

const RELEASE_OG_LAYOUT = {
  edge: 48,
  releaseIconSize: 64,
  screenshotHeight: 946 / (16 / 9),
  screenshotLeft: 399,
  screenshotWidth: 946,
  textWidth: 303,
} as const;

function decodeFontDataUrl(dataUrl: string) {
  const encodedFont = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Buffer.from(encodedFont, "base64");
}

const OUTFIT_FONTS = {
  regular: decodeFontDataUrl(outfitRegularDataUrl),
  bold: decodeFontDataUrl(outfitBoldDataUrl),
} as const;

function truncateText(text: string, maximumLength: number) {
  if (text.length <= maximumLength) return text;

  const truncatedText = text.slice(0, maximumLength - 1).trimEnd();
  return `${truncatedText}…`;
}

function NotebookTextIcon() {
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 24 24"
      fill="none"
      stroke={RELEASE_OG_COLORS.mutedForeground}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6h4" />
      <path d="M2 10h4" />
      <path d="M2 14h4" />
      <path d="M2 18h4" />
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9.5 8h5" />
      <path d="M9.5 12H16" />
      <path d="M9.5 16H14" />
    </svg>
  );
}

function getReleaseTypography(title: string, description?: string) {
  const combinedLength = title.length + (description?.length ?? 0);

  if (title.length > 48 || combinedLength > 155) {
    return {
      descriptionFontSize: 18,
      titleFontSize: 36,
    } as const;
  }

  if (title.length > 30 || combinedLength > 100) {
    return {
      descriptionFontSize: 20,
      titleFontSize: 42,
    } as const;
  }

  return {
    descriptionFontSize: 22,
    titleFontSize: 48,
  } as const;
}

function ReleaseOgImage({
  release,
  screenshotDataUrl,
}: {
  release: ReleaseOgData;
  screenshotDataUrl?: string;
}) {
  const title = truncateText(release.title, RELEASE_OG_TEXT_LIMITS.title);
  const description = release.description
    ? truncateText(release.description, RELEASE_OG_TEXT_LIMITS.description)
    : undefined;
  const typography = getReleaseTypography(title, description);

  return (
    <div
      style={{
        backgroundColor: RELEASE_OG_COLORS.background,
        color: RELEASE_OG_COLORS.foreground,
        display: "flex",
        fontFamily: "Outfit",
        height: "100%",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          backgroundColor: RELEASE_OG_COLORS.muted,
          borderRadius: "16px",
          display: "flex",
          height: RELEASE_OG_LAYOUT.releaseIconSize,
          justifyContent: "center",
          left: RELEASE_OG_LAYOUT.edge,
          position: "absolute",
          top: RELEASE_OG_LAYOUT.edge,
          width: RELEASE_OG_LAYOUT.releaseIconSize,
        }}
      >
        <div style={{ display: "flex", transform: "scale(0.75)" }}>
          <NotebookTextIcon />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          left: RELEASE_OG_LAYOUT.edge,
          position: "absolute",
          top: "176px",
          width: `${RELEASE_OG_LAYOUT.textWidth}px`,
        }}
      >
        <div
          style={{
            color: RELEASE_OG_COLORS.mutedForeground,
            display: "flex",
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "1.4px",
            lineHeight: 1.2,
            textTransform: "uppercase",
          }}
        >
          {dayjs(release.publish_date).format("MMMM D, YYYY")}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: `${typography.titleFontSize}px`,
            fontWeight: 700,
            letterSpacing: "-1.2px",
            lineHeight: 1.02,
            marginTop: "16px",
          }}
        >
          {title}
        </div>
        {description && (
          <div
            style={{
              color: RELEASE_OG_COLORS.mutedForeground,
              display: "flex",
              fontSize: `${typography.descriptionFontSize}px`,
              lineHeight: 1.18,
              marginTop: "14px",
            }}
          >
            {description}
          </div>
        )}
      </div>
      <div
        style={{
          borderRadius: "16px",
          boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.2)",
          display: "flex",
          height: `${RELEASE_OG_LAYOUT.screenshotHeight}px`,
          left: `${RELEASE_OG_LAYOUT.screenshotLeft}px`,
          overflow: "hidden",
          position: "absolute",
          top: `${RELEASE_OG_LAYOUT.edge}px`,
          width: `${RELEASE_OG_LAYOUT.screenshotWidth}px`,
        }}
      >
        <img
          src={screenshotDataUrl ?? defaultScreenshotDataUrl}
          alt=""
          width={RELEASE_OG_LAYOUT.screenshotWidth}
          height={RELEASE_OG_LAYOUT.screenshotHeight}
          style={{
            borderRadius: "16px",
            height: RELEASE_OG_LAYOUT.screenshotHeight,
            objectFit: "cover",
            width: RELEASE_OG_LAYOUT.screenshotWidth,
          }}
        />
      </div>
      <div
        style={{
          alignItems: "center",
          bottom: "36px",
          display: "flex",
          fontSize: "24px",
          fontWeight: 700,
          gap: "10px",
          left: `${RELEASE_OG_LAYOUT.edge}px`,
          letterSpacing: "0.5px",
          position: "absolute",
        }}
      >
        <img
          src={serialLogoDataUrl}
          alt=""
          width={32}
          height={32}
          style={{ borderRadius: "8px", height: 32, width: 32 }}
        />
        Serial
      </div>
    </div>
  );
}

export async function renderReleaseOgImage(
  release: ReleaseOgData,
  screenshotDataUrl?: string,
) {
  const svg = await satori(
    <ReleaseOgImage release={release} screenshotDataUrl={screenshotDataUrl} />,
    {
      ...RELEASE_OG_IMAGE_SIZE,
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
    },
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}
