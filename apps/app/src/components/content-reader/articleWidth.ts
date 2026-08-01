import type { CSSProperties } from "react";

const ARTICLE_WIDTH_LAYOUTS = [
  ["max-w-xl", "container-xl"],
  ["max-w-2xl", "container-2xl"],
  ["max-w-3xl", "container-3xl"],
  ["max-w-4xl", "container-4xl"],
  ["max-w-5xl", "container-5xl"],
  ["max-w-6xl", "container-6xl"],
  ["max-w-7xl", "container-7xl"],
] as const;

export function getArticleWidthLayout(zoom: number) {
  const [className, widthVariable] =
    ARTICLE_WIDTH_LAYOUTS[zoom] ?? ARTICLE_WIDTH_LAYOUTS[0];

  return {
    className,
    style: {
      "--article-max-width": `var(--${widthVariable})`,
    } as CSSProperties,
  };
}
