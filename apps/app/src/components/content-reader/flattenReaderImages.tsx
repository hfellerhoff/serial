import React from "react";
import { ArticleImageLightbox } from "~/components/feed/read/ArticleImageLightbox";

function isImageLightbox(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === ArticleImageLightbox;
}

function hasLinkedContent(node: React.ReactNode): boolean {
  if (typeof node === "string") return node.trim().length > 0;
  if (typeof node === "number") return true;
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return false;

  return React.Children.toArray(node.props.children).some(hasLinkedContent);
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

  const anchorHasLinkedContent = remainingChildren.some(hasLinkedContent);
  const keepWrapper =
    remainingChildren.length > 0 &&
    (element.type !== "a" || anchorHasLinkedContent);
  const rest = keepWrapper
    ? React.cloneElement(element, undefined, ...remainingChildren)
    : null;

  return { images: collectedImages, rest };
}

export function flattenReaderImages(
  nodes: React.ReactNode[],
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  for (const node of nodes) {
    const { images, rest } = extractImages(node);
    result.push(...images);
    if (rest !== null) result.push(rest);
  }
  return result;
}
