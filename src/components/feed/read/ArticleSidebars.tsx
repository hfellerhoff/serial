"use client";

import { ListTree } from "lucide-react";
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  buildInnerDocumentLinkGraph,
  getNoteSource,
  isBacklinkToSource,
} from "./innerDocumentLinks";
import type { ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import { useMediaQuery } from "~/lib/hooks/use-media-query";
import { getScrollContainer } from "~/lib/scroll";
import { useFlagState } from "~/lib/hooks/useFlagState";

const PREFERRED_PANE_WIDTH = 240;
const PREFERRED_CONTENTS_PANE_WIDTH = 264;
const MINIMUM_PANE_WIDTH = 240;
const PANE_GAP = 16;
const FOOTNOTE_GAP = 12;
const FOOTNOTE_RICH_TEXT_CLASSES =
  "[&_a]:text-foreground [&_a]:-m-1 [&_a]:rounded [&_a]:p-1 [&_a]:font-semibold [&_a:hover]:underline [&_a:hover]:underline-offset-2 [&_img]:mt-2 [&_img]:max-w-full [&_img]:rounded [&_li+li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_p+p]:mt-2 [&_strong]:font-semibold [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-4";

type HeadingItem = {
  id: string;
  label: string;
  depth: number;
  element: HTMLHeadingElement;
};

type FootnoteItem = {
  id: string;
  label: string;
  content: ReactNode[];
  reference: HTMLAnchorElement;
  source: HTMLElement;
};

type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type ArticleSidebarsProps = {
  article: HTMLDivElement | null;
  contentKey: string;
  scrollToElement: (element: HTMLElement) => void;
};

function slugifyHeading(label: string): string {
  return (
    label
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function getUniqueId(label: string, usedIds: Set<string>): string {
  const baseId = slugifyHeading(label);
  let id = baseId;
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(id);
  return id;
}

const ALLOWED_FOOTNOTE_ELEMENTS = new Set([
  "a",
  "abbr",
  "b",
  "br",
  "cite",
  "code",
  "del",
  "em",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "ul",
]);

function getSafeUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  const url = value.trim();
  if (
    url.startsWith("#") ||
    url.startsWith("/") ||
    /^https?:\/\//i.test(url) ||
    /^mailto:/i.test(url)
  ) {
    return url;
  }
  return undefined;
}

function renderFootnoteNode(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof HTMLElement)) return null;

  const tagName = node.tagName.toLocaleLowerCase();
  const children = Array.from(node.childNodes).map((child, index) =>
    renderFootnoteNode(child, `${key}-${index}`),
  );

  if (!ALLOWED_FOOTNOTE_ELEMENTS.has(tagName)) return children;

  const props: Record<string, unknown> = { key };
  if (tagName === "a") {
    const href = getSafeUrl(node.getAttribute("href"));
    if (!href) return children;
    props.href = href;
    if (!href.startsWith("#")) {
      props.target = "_blank";
      props.rel = "noopener noreferrer";
    }
  } else if (tagName === "img") {
    const src = getSafeUrl(node.getAttribute("src"));
    if (!src) return null;
    props.src = src;
    props.alt = node.getAttribute("alt") ?? "";
    props.loading = "lazy";
  } else if (tagName === "abbr" || tagName === "q") {
    const title = node.getAttribute("title");
    if (title) props.title = title;
  } else if (tagName === "time") {
    const dateTime = node.getAttribute("datetime");
    if (dateTime) props.dateTime = dateTime;
  }

  return createElement(tagName, props, ...children);
}

function getFootnoteContent(
  target: HTMLElement,
  sourceAnchor: HTMLElement | null,
): { content: ReactNode[]; text: string } {
  const clone = target.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
    .forEach((backlink) => {
      const hasBacklinkSemantics =
        backlink.getAttribute("role") === "doc-backlink" ||
        backlink.classList.contains("footnote-backref") ||
        backlink
          .getAttribute("title")
          ?.toLocaleLowerCase()
          .startsWith("jump back");

      if (isBacklinkToSource(backlink, sourceAnchor) || hasBacklinkSemantics) {
        backlink.remove();
      }
    });

  return {
    content: Array.from(clone.childNodes).map((node, index) =>
      renderFootnoteNode(node, `${target.id}-${index}`),
    ),
    text: clone.textContent?.replace(/\s+/g, " ").trim() ?? "",
  };
}

function getFootnotes(article: HTMLElement): FootnoteItem[] {
  const seenTargetIds = new Set<string>();
  const footnotes: FootnoteItem[] = [];
  const graph = buildInnerDocumentLinkGraph(article);

  for (const { link, target, sourceAnchor } of graph.noteLinks) {
    const targetId =
      target.id ||
      target.getAttribute("name") ||
      target.getAttribute("data-id") ||
      link.getAttribute("href") ||
      String(footnotes.length + 1);
    if (seenTargetIds.has(targetId)) continue;
    const { content, text } = getFootnoteContent(target, sourceAnchor);
    if (!text) continue;

    const source = getNoteSource(target, article);
    source.setAttribute("data-serial-footnotes-source", "true");
    link.setAttribute("data-serial-footnote-reference", "true");
    seenTargetIds.add(targetId);
    footnotes.push({
      id: targetId,
      label: link.textContent?.trim() || String(footnotes.length + 1),
      content,
      reference: link,
      source,
    });
  }

  return footnotes;
}

function getHeadings(article: HTMLElement): {
  headings: HeadingItem[];
  modifiedHeadings: Array<{
    heading: HTMLHeadingElement;
    originalId: string;
  }>;
} {
  const allHeadings = Array.from(
    article.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"),
  ).filter(
    (heading) =>
      !heading.hasAttribute("data-serial-header") &&
      !heading.closest('[data-serial-footnotes-source="true"]') &&
      !!heading.textContent?.trim(),
  );

  if (allHeadings.length === 0) {
    return { headings: [], modifiedHeadings: [] };
  }

  const shallowestLevel = Math.min(
    ...allHeadings.map((heading) => Number(heading.tagName.slice(1))),
  );
  const headingElements = new Set<HTMLElement>(allHeadings);
  const usedIds = new Set(
    Array.from(article.querySelectorAll<HTMLElement>("[id]"))
      .filter((element) => !headingElements.has(element))
      .map((element) => element.id)
      .filter(Boolean),
  );
  const modifiedHeadings: Array<{
    heading: HTMLHeadingElement;
    originalId: string;
  }> = [];

  const headings = allHeadings
    .filter(
      (heading) => Number(heading.tagName.slice(1)) <= shallowestLevel + 2,
    )
    .map((heading) => {
      const label = heading.textContent.replace(/\s+/g, " ").trim();
      let id = heading.id;

      if (!id || usedIds.has(id)) {
        const originalId = id;
        id = getUniqueId(label, usedIds);
        heading.id = id;
        heading.setAttribute("data-serial-generated-heading-id", "true");
        modifiedHeadings.push({ heading, originalId });
      } else {
        usedIds.add(id);
      }

      return {
        id,
        label,
        depth: Number(heading.tagName.slice(1)) - shallowestLevel,
        element: heading,
      };
    });

  return { headings, modifiedHeadings };
}

function FootnoteContent({ footnote }: { footnote: FootnoteItem }) {
  return (
    <>
      <span className="bg-secondary text-secondary-foreground mr-2 inline-flex min-w-5 items-center justify-center rounded px-1 text-xs font-medium">
        {footnote.label}
      </span>
      {footnote.content}
    </>
  );
}

export function ArticleSidebars({
  article,
  contentKey,
  scrollToElement,
}: ArticleSidebarsProps) {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [footnotes, setFootnotes] = useState<FootnoteItem[]>([]);
  const [footnotePositions, setFootnotePositions] = useState<number[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [hoveredFootnoteId, setHoveredFootnoteId] = useState<string | null>(
    null,
  );
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  const [contentsPaneLeft, setContentsPaneLeft] = useState(16);
  const [footnotesPaneWidth, setFootnotesPaneWidth] =
    useState(PREFERRED_PANE_WIDTH);
  const [activeFootnote, setActiveFootnote] = useState<FootnoteItem | null>(
    null,
  );
  const [fallbackAnchorRect, setFallbackAnchorRect] =
    useState<AnchorRect | null>(null);
  const footnotesPaneRef = useRef<HTMLElement>(null);
  const hasRoomForPanes = paneWidth !== null;
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [footnoteDisplay] = useFlagState("ARTICLE_FOOTNOTES");
  const [tableOfContentsDisplay] = useFlagState("ARTICLE_TABLE_OF_CONTENTS");

  useLayoutEffect(() => {
    if (!article) return;
    let analyzedFootnotes: FootnoteItem[] = [];
    let modifiedHeadings: Array<{
      heading: HTMLHeadingElement;
      originalId: string;
    }> = [];
    let analysisAnimationFrame = 0;

    const clearAnalysis = () => {
      analyzedFootnotes.forEach(({ reference, source }) => {
        reference.removeAttribute("data-serial-footnote-reference");
        source.removeAttribute("data-serial-footnotes-source");
      });
      modifiedHeadings.forEach(({ heading, originalId }) => {
        if (originalId) {
          heading.id = originalId;
        } else {
          heading.removeAttribute("id");
        }
        heading.removeAttribute("data-serial-generated-heading-id");
      });
      analyzedFootnotes = [];
      modifiedHeadings = [];
    };

    const analyzeArticle = () => {
      clearAnalysis();
      analyzedFootnotes = getFootnotes(article);
      const headingAnalysis = getHeadings(article);
      modifiedHeadings = headingAnalysis.modifiedHeadings;
      setFootnotes(analyzedFootnotes);
      setFootnotePositions([]);
      setHeadings(headingAnalysis.headings);
      setActiveHeadingId(headingAnalysis.headings[0]?.id ?? null);
      setHoveredFootnoteId(null);
      setActiveFootnote(null);
      setFallbackAnchorRect(null);
    };

    const scheduleAnalysis = () => {
      cancelAnimationFrame(analysisAnimationFrame);
      analysisAnimationFrame = requestAnimationFrame(analyzeArticle);
    };

    analyzeArticle();
    scheduleAnalysis();
    const mutationObserver = new MutationObserver(scheduleAnalysis);
    mutationObserver.observe(article, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(analysisAnimationFrame);
      mutationObserver.disconnect();
      article.removeAttribute("data-serial-sidebars-visible");
      clearAnalysis();
    };
  }, [article, contentKey]);

  useLayoutEffect(() => {
    if (!article) return;
    const scrollContainer = getScrollContainer();
    const leftBoundaryElement = document.querySelector<HTMLElement>(
      "[data-serial-reader-left-boundary]",
    );
    const rightBoundaryElement = document.querySelector<HTMLElement>(
      "[data-serial-reader-right-boundary]",
    );

    const updatePaneVisibility = () => {
      const articleRect = article.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const leftBoundary =
        leftBoundaryElement?.getBoundingClientRect().left ??
        containerRect.left + 24;
      const rightBoundary =
        rightBoundaryElement?.getBoundingClientRect().right ??
        containerRect.right - 36;
      const rightAvailablePaneWidth = Math.floor(
        rightBoundary - articleRect.right - PANE_GAP,
      );
      const availablePaneWidth = Math.floor(
        Math.min(
          articleRect.left - leftBoundary - PANE_GAP,
          rightAvailablePaneWidth,
        ),
      );
      const nextPaneWidth =
        availablePaneWidth >= MINIMUM_PANE_WIDTH
          ? Math.min(PREFERRED_CONTENTS_PANE_WIDTH, availablePaneWidth)
          : null;

      setPaneWidth(nextPaneWidth);
      setContentsPaneLeft(Math.round(leftBoundary));
      setFootnotesPaneWidth(
        rightAvailablePaneWidth < PREFERRED_CONTENTS_PANE_WIDTH
          ? rightAvailablePaneWidth
          : PREFERRED_PANE_WIDTH,
      );
    };

    updatePaneVisibility();
    const layoutAnimationFrame = requestAnimationFrame(updatePaneVisibility);
    const resizeObserver = new ResizeObserver(updatePaneVisibility);
    resizeObserver.observe(article);
    resizeObserver.observe(scrollContainer);
    if (leftBoundaryElement) resizeObserver.observe(leftBoundaryElement);
    if (rightBoundaryElement) resizeObserver.observe(rightBoundaryElement);
    window.addEventListener("resize", updatePaneVisibility);

    return () => {
      cancelAnimationFrame(layoutAnimationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePaneVisibility);
      article.removeAttribute("data-serial-sidebars-visible");
    };
  }, [article, contentKey]);

  useLayoutEffect(() => {
    if (!article) return;
    const showSideNotes =
      hasRoomForPanes && footnoteDisplay === "show" && footnotes.length > 0;

    article.toggleAttribute("data-serial-sidebars-visible", showSideNotes);
    return () => article.removeAttribute("data-serial-sidebars-visible");
  }, [article, footnoteDisplay, footnotes, hasRoomForPanes]);

  useEffect(() => {
    if (!article) return;
    if (footnoteDisplay === "hide") return;

    const handleReferenceClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const reference = event.target.closest<HTMLAnchorElement>(
        "[data-serial-footnote-reference]",
      );
      if (!reference || !article.contains(reference)) return;
      const footnote = footnotes.find(
        (candidate) => candidate.reference === reference,
      );
      if (!footnote) return;

      event.preventDefault();
      event.stopPropagation();
      if (hasRoomForPanes) return;

      const rect = reference.getBoundingClientRect();
      setFallbackAnchorRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      setActiveFootnote(footnote);
    };

    const referenceHoverCleanups = footnotes.map((footnote) => {
      const handleMouseEnter = () => setHoveredFootnoteId(footnote.id);
      const handleMouseLeave = () =>
        setHoveredFootnoteId((currentId) =>
          currentId === footnote.id ? null : currentId,
        );

      footnote.reference.addEventListener("mouseenter", handleMouseEnter);
      footnote.reference.addEventListener("mouseleave", handleMouseLeave);
      return () => {
        footnote.reference.removeEventListener("mouseenter", handleMouseEnter);
        footnote.reference.removeEventListener("mouseleave", handleMouseLeave);
      };
    });

    const closeFallback = () => {
      setActiveFootnote(null);
      setFallbackAnchorRect(null);
    };

    article.addEventListener("click", handleReferenceClick);
    getScrollContainer().addEventListener("scroll", closeFallback, {
      passive: true,
    });
    window.addEventListener("resize", closeFallback);

    return () => {
      article.removeEventListener("click", handleReferenceClick);
      referenceHoverCleanups.forEach((cleanup) => cleanup());
      getScrollContainer().removeEventListener("scroll", closeFallback);
      window.removeEventListener("resize", closeFallback);
    };
  }, [article, footnoteDisplay, footnotes, hasRoomForPanes]);

  useLayoutEffect(() => {
    footnotes.forEach((footnote) => {
      footnote.reference.toggleAttribute(
        "data-serial-footnote-highlighted",
        footnote.id === hoveredFootnoteId,
      );
    });

    return () => {
      footnotes.forEach((footnote) =>
        footnote.reference.removeAttribute("data-serial-footnote-highlighted"),
      );
    };
  }, [footnotes, hoveredFootnoteId]);

  useEffect(() => {
    if (!hasRoomForPanes || headings.length === 0) return;
    const scrollContainer = getScrollContainer();
    let animationFrame = 0;

    const updateActiveHeading = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const containerRect = scrollContainer.getBoundingClientRect();
        const readingLine = containerRect.top + containerRect.height / 3;
        let activeHeading = headings[0]!;

        for (const heading of headings) {
          if (heading.element.getBoundingClientRect().top > readingLine) break;
          activeHeading = heading;
        }

        setActiveHeadingId(activeHeading.id);
      });
    };

    updateActiveHeading();
    scrollContainer.addEventListener("scroll", updateActiveHeading, {
      passive: true,
    });

    return () => {
      cancelAnimationFrame(animationFrame);
      scrollContainer.removeEventListener("scroll", updateActiveHeading);
    };
  }, [hasRoomForPanes, headings]);

  const updateFootnotePositions = useCallback(() => {
    const pane = footnotesPaneRef.current;
    if (!article || !pane || !hasRoomForPanes) return;

    const articleRect = article.getBoundingClientRect();
    const renderedNotes = Array.from(
      pane.querySelectorAll<HTMLElement>("[data-footnote-pane-item]"),
    );
    let previousBottom = 0;
    const nextPositions = footnotes.map((footnote, index) => {
      const referenceTop =
        footnote.reference.getBoundingClientRect().top - articleRect.top;
      const top = Math.max(referenceTop, previousBottom);
      previousBottom =
        top +
        (renderedNotes[index]?.getBoundingClientRect().height ?? 0) +
        FOOTNOTE_GAP;
      return top;
    });

    setFootnotePositions((currentPositions) =>
      currentPositions.length === nextPositions.length &&
      currentPositions.every(
        (position, index) => Math.abs(position - nextPositions[index]!) < 1,
      )
        ? currentPositions
        : nextPositions,
    );
  }, [article, footnotes, hasRoomForPanes]);

  useLayoutEffect(() => {
    if (
      !hasRoomForPanes ||
      footnoteDisplay === "hide" ||
      footnotes.length === 0
    ) {
      return;
    }
    if (!article) return;

    updateFootnotePositions();
    const resizeObserver = new ResizeObserver(updateFootnotePositions);
    resizeObserver.observe(article);
    if (footnotesPaneRef.current)
      resizeObserver.observe(footnotesPaneRef.current);
    article.addEventListener("load", updateFootnotePositions, true);

    return () => {
      resizeObserver.disconnect();
      article.removeEventListener("load", updateFootnotePositions, true);
    };
  }, [
    article,
    footnoteDisplay,
    footnotes,
    hasRoomForPanes,
    updateFootnotePositions,
  ]);

  return (
    <>
      {hasRoomForPanes && headings.length > 0 && (
        <aside
          aria-label="Table of contents"
          className="group fixed top-1/2 z-10 flex h-[50svh] -translate-y-1/2 items-center"
          style={{ left: contentsPaneLeft, width: paneWidth }}
        >
          <nav
            className={`bg-background/95 border-border max-h-full w-full overflow-y-auto rounded-lg border p-2 shadow-sm backdrop-blur-sm transition-opacity ${
              tableOfContentsDisplay === "hover"
                ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                : ""
            }`}
          >
            <div className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs font-medium tracking-wide uppercase">
              <ListTree aria-hidden="true" className="size-3.5" />
              Contents
            </div>
            <ol className="mt-1 space-y-0.5">
              {headings.map((heading) => {
                const isActive = heading.id === activeHeadingId;
                return (
                  <li key={heading.id}>
                    <button
                      type="button"
                      aria-current={isActive ? "location" : undefined}
                      className={`hover:bg-accent focus-visible:ring-ring w-full overflow-hidden rounded-md px-2 py-1.5 text-left text-sm text-ellipsis whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                      }`}
                      style={{ paddingLeft: `${8 + heading.depth * 14}px` }}
                      onClick={() => scrollToElement(heading.element)}
                    >
                      {heading.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>
      )}

      {hasRoomForPanes &&
        footnoteDisplay === "show" &&
        footnotes.length > 0 && (
          <aside
            ref={footnotesPaneRef}
            aria-label="Footnotes"
            className="absolute top-0 bottom-0 z-10"
            style={{
              left: `calc(100% + ${PANE_GAP}px)`,
              width: footnotesPaneWidth,
            }}
          >
            {footnotes.map((footnote, index) => (
              <div
                key={footnote.id}
                data-footnote-pane-item
                className={`bg-background/95 text-muted-foreground absolute inset-x-0 rounded-lg border p-3 text-sm leading-relaxed break-words shadow-sm backdrop-blur-sm ${FOOTNOTE_RICH_TEXT_CLASSES} ${
                  hoveredFootnoteId === footnote.id
                    ? "border-primary"
                    : "border-border"
                }`}
                style={{ top: footnotePositions[index] ?? 0 }}
                onMouseEnter={() => setHoveredFootnoteId(footnote.id)}
                onMouseLeave={() =>
                  setHoveredFootnoteId((currentId) =>
                    currentId === footnote.id ? null : currentId,
                  )
                }
              >
                <FootnoteContent footnote={footnote} />
              </div>
            ))}
          </aside>
        )}

      {!hasRoomForPanes &&
        footnoteDisplay === "show" &&
        isDesktop &&
        activeFootnote &&
        fallbackAnchorRect && (
          <HoverCard
            open
            onOpenChange={(open) => {
              if (!open) setActiveFootnote(null);
            }}
          >
            <HoverCardTrigger
              aria-hidden="true"
              tabIndex={-1}
              className="pointer-events-none fixed z-50 opacity-0"
              style={fallbackAnchorRect}
            >
              {activeFootnote.label}
            </HoverCardTrigger>
            <HoverCardContent
              align="start"
              side="right"
              className={`text-muted-foreground w-[240px] text-sm leading-relaxed break-words ${FOOTNOTE_RICH_TEXT_CLASSES}`}
            >
              <FootnoteContent footnote={activeFootnote} />
            </HoverCardContent>
          </HoverCard>
        )}

      {!hasRoomForPanes && footnoteDisplay === "show" && !isDesktop && (
        <Drawer
          open={activeFootnote !== null}
          onOpenChange={(open) => {
            if (!open) setActiveFootnote(null);
          }}
        >
          <DrawerContent className="max-h-[calc(100dvh-6rem)]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Reference {activeFootnote?.label ?? ""}</DrawerTitle>
              <DrawerDescription>
                Reference details from this article
              </DrawerDescription>
            </DrawerHeader>
            {activeFootnote && (
              <div
                className={`text-muted-foreground overflow-y-auto px-4 pt-4 pb-6 text-sm leading-relaxed break-words [&_a]:underline [&_a]:underline-offset-2 ${FOOTNOTE_RICH_TEXT_CLASSES}`}
              >
                <FootnoteContent footnote={activeFootnote} />
              </div>
            )}
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
