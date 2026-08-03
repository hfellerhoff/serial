import createDOMPurify from "dompurify";

import {
  BOOKMARK_CAPTURE_ALLOWED_ATTRIBUTES,
  BOOKMARK_CAPTURE_ALLOWED_TAGS,
  BOOKMARK_CAPTURE_LIMITS,
} from "./policy";

const YOUTUBE_EMBED_HOSTS = new Set([
  "www.youtube.com",
  "www.youtube-nocookie.com",
]);
const URL_ATTRIBUTES = ["href", "src"] as const;

function allowedResolvedUrl(value: string, baseUrl: string, isLink: boolean) {
  if (value.startsWith("#")) return isLink ? value : null;
  try {
    const resolved = new URL(value, baseUrl);
    if (resolved.username || resolved.password) return null;
    if (resolved.protocol === "http:" || resolved.protocol === "https:") {
      return resolved.toString();
    }
    if (isLink && resolved.protocol === "mailto:") return resolved.toString();
    return null;
  } catch {
    return null;
  }
}

function rewriteSrcset(value: string, baseUrl: string) {
  const candidates = value.split(",").map((candidate) => candidate.trim());
  if (candidates.length === 0 || candidates.some((candidate) => !candidate)) {
    return null;
  }
  const rewritten: string[] = [];
  for (const candidate of candidates) {
    const [url, ...descriptor] = candidate.split(/\s+/);
    const resolved = url ? allowedResolvedUrl(url, baseUrl, false) : null;
    if (!resolved || descriptor.length > 1) return null;
    if (
      descriptor[0] &&
      !/^([1-9]\d*(?:\.\d+)?x|[1-9]\d*w)$/.test(descriptor[0])
    ) {
      return null;
    }
    rewritten.push([resolved, ...descriptor].join(" "));
  }
  return rewritten.join(", ");
}

function youtubePlaceholder(document: Document, iframe: HTMLIFrameElement) {
  const source = iframe.getAttribute("src");
  if (!source) return null;
  try {
    const parsed = new URL(source, document.baseURI);
    const pathMatch = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(parsed.pathname);
    const parameters = [...parsed.searchParams.keys()];
    if (
      parsed.protocol !== "https:" ||
      !YOUTUBE_EMBED_HOSTS.has(parsed.hostname) ||
      !pathMatch?.[1] ||
      parameters.some((parameter) => parameter !== "start")
    ) {
      return null;
    }
    const start = parsed.searchParams.get("start");
    if (start !== null && !/^\d+$/.test(start)) return null;
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-serial-embed", "youtube");
    placeholder.setAttribute("data-video-id", pathMatch[1]);
    if (start !== null) placeholder.setAttribute("data-start", start);
    return placeholder;
  } catch {
    return null;
  }
}

function captureIdPrefix(effectiveUrl: string) {
  let hash = 2166136261;
  for (const character of effectiveUrl) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `capture-${(hash >>> 0).toString(16)}-`;
}

function rewriteDocument(document: Document, effectiveUrl: string) {
  for (const iframe of document.querySelectorAll("iframe")) {
    const placeholder = youtubePlaceholder(document, iframe);
    if (placeholder) iframe.replaceWith(placeholder);
    else iframe.remove();
  }

  const idPrefix = captureIdPrefix(effectiveUrl);
  const rewrittenIds = new Map<string, string>();
  for (const element of document.querySelectorAll("[id]")) {
    const id = element.getAttribute("id");
    if (!id) continue;
    const rewritten = `${idPrefix}${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    rewrittenIds.set(id, rewritten);
    element.setAttribute("id", rewritten);
  }

  for (const element of document.querySelectorAll("*")) {
    for (const attribute of URL_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      if (attribute === "href" && value.startsWith("#")) {
        const target = rewrittenIds.get(value.slice(1));
        if (target) element.setAttribute(attribute, `#${target}`);
        else element.removeAttribute(attribute);
        continue;
      }
      const resolved = allowedResolvedUrl(
        value,
        effectiveUrl,
        attribute === "href",
      );
      if (resolved) element.setAttribute(attribute, resolved);
      else element.removeAttribute(attribute);
    }
    const srcset = element.getAttribute("srcset");
    if (srcset !== null) {
      const rewritten = rewriteSrcset(srcset, effectiveUrl);
      if (rewritten) element.setAttribute("srcset", rewritten);
      else element.removeAttribute("srcset");
    }
  }
}

export function sanitizeCaptureHtml(
  contentHtml: string,
  effectiveUrl: string,
  sourceDocument: Document,
) {
  const captureDocument =
    new sourceDocument.defaultView!.DOMParser().parseFromString(
      contentHtml,
      "text/html",
    );
  const base = captureDocument.createElement("base");
  base.href = effectiveUrl;
  captureDocument.head.append(base);
  rewriteDocument(captureDocument, effectiveUrl);
  const purifier = createDOMPurify(sourceDocument.defaultView!);
  const sanitized = purifier
    .sanitize(captureDocument.body.innerHTML, {
      ALLOWED_TAGS: [...BOOKMARK_CAPTURE_ALLOWED_TAGS],
      ALLOWED_ATTR: [...BOOKMARK_CAPTURE_ALLOWED_ATTRIBUTES],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      CUSTOM_ELEMENT_HANDLING: {
        tagNameCheck: null,
        attributeNameCheck: null,
        allowCustomizedBuiltInElements: false,
      },
    })
    .trim();
  if (!sanitized) return { reason: "invalid_capture" as const };
  if (
    new TextEncoder().encode(sanitized).byteLength >
    BOOKMARK_CAPTURE_LIMITS.storedHtmlBytes
  ) {
    return { reason: "too_large" as const };
  }
  return { contentHtml: sanitized };
}
