import { createHash } from "node:crypto";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { BOOKMARK_CAPTURE_LIMITS, SANITIZER_POLICY_VERSION } from "./contracts";
import { normalizeBookmarkUrl } from "./url";
import {
  BOOKMARK_CAPTURE_ALLOWED_ATTRIBUTES,
  BOOKMARK_CAPTURE_ALLOWED_TAGS,
} from "./sanitizePolicy";

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "www.youtube-nocookie.com"]);
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const URL_ATTRIBUTES = ["href", "src"] as const;

export class InvalidCaptureHtmlError extends Error {}

function allowedResolvedUrl(value: string, baseUrl: string, isLink: boolean) {
  if (value.startsWith("#")) return isLink ? value : null;

  let resolved: URL;
  try {
    resolved = new URL(value, baseUrl);
  } catch {
    return null;
  }

  if (resolved.username || resolved.password) return null;
  if (resolved.protocol === "http:" || resolved.protocol === "https:") {
    return resolved.toString();
  }
  if (isLink && resolved.protocol === "mailto:") return resolved.toString();
  return null;
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
      !YOUTUBE_HOSTS.has(parsed.hostname) ||
      !pathMatch?.[1] ||
      !YOUTUBE_VIDEO_ID.test(pathMatch[1]) ||
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

function rewriteDocument(document: Document, effectiveUrl: string) {
  for (const iframe of document.querySelectorAll("iframe")) {
    const placeholder = youtubePlaceholder(document, iframe);
    if (placeholder) iframe.replaceWith(placeholder);
    else iframe.remove();
  }

  const idPrefix = `capture-${createHash("sha256")
    .update(effectiveUrl)
    .digest("hex")
    .slice(0, 12)}-`;
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

export function sanitizeCaptureHtml(input: {
  contentHtml: string;
  effectiveUrl: string;
}) {
  const effectiveUrl = normalizeBookmarkUrl(input.effectiveUrl);
  const dom = new JSDOM(`<body>${input.contentHtml}</body>`, {
    url: effectiveUrl,
    runScripts: "outside-only",
  });

  try {
    const { document } = dom.window;
    if (
      document.querySelectorAll("*").length >
      BOOKMARK_CAPTURE_LIMITS.domElements
    ) {
      throw new InvalidCaptureHtmlError("The document has too many elements");
    }

    rewriteDocument(document, effectiveUrl);
    const purifier = createDOMPurify(dom.window);
    const sanitized = purifier.sanitize(document.body.innerHTML, {
      ALLOWED_TAGS: [...BOOKMARK_CAPTURE_ALLOWED_TAGS],
      ALLOWED_ATTR: [...BOOKMARK_CAPTURE_ALLOWED_ATTRIBUTES],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      CUSTOM_ELEMENT_HANDLING: {
        tagNameCheck: null,
        attributeNameCheck: null,
        allowCustomizedBuiltInElements: false,
      },
    });
    const normalized = sanitized.trim();
    if (!normalized) {
      throw new InvalidCaptureHtmlError("The captured document is empty");
    }
    if (
      Buffer.byteLength(normalized, "utf8") >
      BOOKMARK_CAPTURE_LIMITS.storedHtmlBytes
    ) {
      throw new InvalidCaptureHtmlError("The captured document is too large");
    }
    return {
      contentHtml: normalized,
      contentHash: createHash("sha256").update(normalized).digest("hex"),
      sanitizerPolicyVersion: SANITIZER_POLICY_VERSION,
    };
  } finally {
    dom.window.close();
  }
}
