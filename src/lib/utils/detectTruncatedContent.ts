function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countParagraphTags(html: string): number {
  const matches = html.match(/<p[\s>]/gi);
  return matches ? matches.length : 0;
}

const READ_MORE_PATTERNS = [
  /read more/i,
  /continue reading/i,
  /full story/i,
  /full article/i,
  /continue to article/i,
  /read the full/i,
  /read full/i,
];

function hasReadMorePhrase(text: string): boolean {
  return READ_MORE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Heuristically detects whether RSS feed content appears to be truncated.
 * Combines multiple signals: content length, ellipsis endings, read-more
 * phrases, snippet similarity, and HTML structure.
 *
 * Only meaningful for website/RSS feeds (not video platforms).
 */
export function detectTruncatedContent(
  content: string | undefined,
  contentSnippet: string | undefined,
): boolean {
  if (!content || content.trim().length === 0) {
    return true;
  }

  const strippedContent = stripHtml(content);
  const strippedSnippet = contentSnippet ? stripHtml(contentSnippet) : "";

  const contentLength = strippedContent.length;
  const snippetLength = strippedSnippet.length;

  // Signal 1: Very short content (< 300 chars after stripping HTML)
  if (contentLength < 300) {
    return true;
  }

  // Signal 2: Ends with ellipsis
  const trimmedContent = strippedContent.trim();
  if (trimmedContent.endsWith("…") || trimmedContent.endsWith("...")) {
    return true;
  }

  // Signal 3: Contains read-more phrase in the last 200 characters
  const tail = strippedContent.slice(-200);
  if (hasReadMorePhrase(tail)) {
    return true;
  }

  // Signal 4: Content and snippet are nearly identical in length
  // (suggests the feed only sent a summary, not full content)
  if (snippetLength > 0 && Math.abs(contentLength - snippetLength) < 150) {
    return true;
  }

  // Signal 5: Sparse HTML structure with few paragraphs and short text
  const paragraphCount = countParagraphTags(content);
  if (paragraphCount <= 1 && contentLength < 500) {
    return true;
  }
  if (
    paragraphCount <= 2 &&
    contentLength < 400 &&
    hasReadMorePhrase(strippedContent)
  ) {
    return true;
  }

  return false;
}
