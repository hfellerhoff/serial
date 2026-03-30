"use client";

import React from "react";
import parse, { Element } from "html-react-parser";
import type { HTMLReactParserOptions } from "html-react-parser";
import { CustomVideoPlayer } from "~/components/CustomVideoPlayer";
import { ArticleImageLightbox } from "~/components/feed/read/ArticleImageLightbox";
import { useFlagState } from "~/lib/hooks/useFlagState";
import classes from "~/components/feed/read/article.module.css";

function extractYouTubeVideoId(src: string): string | null {
  const match = src.match(
    /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([^?/]+)/,
  );
  return match?.[1] ?? null;
}

function findImageSrc(node: Element): string | null {
  if (node.name === "img") return node.attribs.src ?? null;
  if (node.name === "source")
    return node.attribs.srcset?.split(/\s/)[0] ?? null;
  for (const child of node.children) {
    if (child instanceof Element) {
      const src = findImageSrc(child);
      if (src) return src;
    }
  }
  return null;
}

function isImageContainer(node: Element): boolean {
  if (node.name === "a") {
    const cls = node.attribs.class ?? "";
    if (cls.includes("image-link") || cls.includes("image2")) return true;
  }
  if (node.name === "figure") return !!findImageSrc(node);
  if (node.attribs.class?.includes("captioned-image-container")) return true;
  return false;
}

export function ArticleContent({ content }: { content: string }) {
  const [videoPlayer] = useFlagState("CUSTOM_VIDEO_PLAYER");

  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (!(domNode instanceof Element)) return;

      // Open all links in new tabs
      if (domNode.name === "a" && domNode.attribs.href) {
        domNode.attribs.target = "_blank";
        domNode.attribs.rel = "noopener noreferrer";
      }

      if (domNode.name === "img") {
        const src = domNode.attribs.src ?? "";
        const alt = domNode.attribs.alt ?? "";
        if (!src) return;
        return <ArticleImageLightbox src={src} alt={alt} />;
      }

      if (isImageContainer(domNode)) {
        const src = findImageSrc(domNode);
        if (src) return <ArticleImageLightbox src={src} />;
      }

      if (domNode.name !== "iframe") return;

      const src = domNode.attribs.src ?? "";
      const videoId = extractYouTubeVideoId(src);
      if (!videoId) return;

      if (videoPlayer === "serial") {
        return (
          <div
            className={`${classes.videoEmbed} my-4 aspect-video w-full overflow-hidden rounded`}
          >
            <CustomVideoPlayer
              videoID={videoId}
              orientation="horizontal"
              isInactive={false}
              isEmbed
            />
          </div>
        );
      }

      return (
        <div className="my-4 aspect-video w-full overflow-hidden rounded">
          <iframe
            width="1600"
            height="900"
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-none"
          />
        </div>
      );
    },
  };

  const parsed = parse(content, options);
  const nodes = Array.isArray(parsed) ? parsed : [parsed];

  return <>{flattenImages(nodes)}</>;
}

function isImageLightbox(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === ArticleImageLightbox;
}

function extractImages(node: React.ReactNode): {
  images: React.ReactNode[];
  rest: React.ReactNode | null;
} {
  if (!React.isValidElement(node)) return { images: [], rest: node };

  if (isImageLightbox(node)) return { images: [node], rest: null };

  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  const children = React.Children.toArray(element.props.children);
  if (children.length === 0) return { images: [], rest: node };

  const collectedImages: React.ReactNode[] = [];
  const remainingChildren: React.ReactNode[] = [];

  for (const child of children) {
    const { images, rest } = extractImages(child);
    collectedImages.push(...images);
    if (rest !== null) remainingChildren.push(rest);
  }

  if (collectedImages.length === 0) return { images: [], rest: node };

  const rest =
    remainingChildren.length > 0
      ? React.cloneElement(element, undefined, ...remainingChildren)
      : null;

  return { images: collectedImages, rest };
}

function flattenImages(nodes: React.ReactNode[]): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  for (const node of nodes) {
    const { images, rest } = extractImages(node);
    result.push(...images);
    if (rest !== null) result.push(rest);
  }
  return result;
}
