const SANITIZED_ID_PREFIXES = ["user-content-"];
const NOTE_CONTAINER_SELECTOR =
  '[role="doc-endnotes"], [data-footnotes], .footnotes, .endnotes, .footnote, .references, .citations';

export type InnerDocumentLink = {
  link: HTMLAnchorElement;
  target: HTMLElement;
  sourceAnchor: HTMLElement | null;
};

export type InnerDocumentLinkGraph = {
  links: InnerDocumentLink[];
  noteLinks: InnerDocumentLink[];
};

function normalizeId(id: string): string {
  for (const prefix of SANITIZED_ID_PREFIXES) {
    if (id.startsWith(prefix)) return id.slice(prefix.length);
  }
  return id;
}

function getHashTargetId(href: string): string {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return "";

  try {
    return decodeURIComponent(href.slice(hashIndex + 1));
  } catch {
    return href.slice(hashIndex + 1);
  }
}

function resolveTarget(
  elementsById: Map<string, HTMLElement>,
  href: string,
): HTMLElement | null {
  return elementsById.get(normalizeId(getHashTargetId(href))) ?? null;
}

function hasSharedIdentity(
  link: HTMLAnchorElement,
  target: HTMLElement,
): boolean {
  const linkIdentity = link.getAttribute("data-id");
  const targetIdentity = target.getAttribute("data-id");
  return !!linkIdentity && !!targetIdentity && linkIdentity === targetIdentity;
}

function hasNoteSemantics(target: HTMLElement): boolean {
  return (
    target.getAttribute("role") === "doc-footnote" ||
    target.closest(NOTE_CONTAINER_SELECTOR) !== null
  );
}

function hasNoteReferenceSemantics(link: HTMLAnchorElement): boolean {
  return (
    link.getAttribute("role") === "doc-noteref" ||
    link.classList.contains("footnote-ref") ||
    link.classList.contains("footnote-reference") ||
    link.getAttribute("aria-describedby") === "footnote-label"
  );
}

function isSuperscriptLinkToLaterListItem(
  innerLink: InnerDocumentLink,
): boolean {
  return (
    innerLink.link.closest("sup") !== null &&
    innerLink.target.tagName === "LI" &&
    (innerLink.link.compareDocumentPosition(innerLink.target) &
      Node.DOCUMENT_POSITION_FOLLOWING) !==
      0
  );
}

function hasReciprocalBacklink(
  candidate: InnerDocumentLink,
  links: InnerDocumentLink[],
): boolean {
  if (!candidate.sourceAnchor) return false;
  const sourceId = normalizeId(candidate.sourceAnchor.id);

  return links.some(
    (innerLink) =>
      candidate.target.contains(innerLink.link) &&
      normalizeId(innerLink.target.id) === sourceId,
  );
}

function isNoteLink(
  candidate: InnerDocumentLink,
  links: InnerDocumentLink[],
): boolean {
  if (
    !candidate.link.closest("sup") &&
    !hasNoteReferenceSemantics(candidate.link)
  ) {
    return false;
  }

  return (
    hasNoteSemantics(candidate.target) ||
    hasSharedIdentity(candidate.link, candidate.target) ||
    hasReciprocalBacklink(candidate, links) ||
    isSuperscriptLinkToLaterListItem(candidate)
  );
}

export function buildInnerDocumentLinkGraph(
  root: HTMLElement,
): InnerDocumentLinkGraph {
  const elementsById = new Map<string, HTMLElement>();
  for (const element of root.querySelectorAll<HTMLElement>("[id], a[name]")) {
    const identifier = element.id || element.getAttribute("name");
    if (identifier) elementsById.set(normalizeId(identifier), element);
  }

  const links: InnerDocumentLink[] = [];
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href*="#"]')) {
    const href = link.getAttribute("href");
    if (!href || href === "#") continue;

    const target = resolveTarget(elementsById, href);
    if (!target) continue;

    links.push({
      link,
      target,
      sourceAnchor: link.closest<HTMLElement>("[id]"),
    });
  }

  return {
    links,
    noteLinks: links.filter((link) => isNoteLink(link, links)),
  };
}

export function getNoteSource(
  target: HTMLElement,
  root: HTMLElement,
): HTMLElement {
  let source: HTMLElement | null = null;
  let current: HTMLElement | null = target;

  while (current && current !== root) {
    if (current.matches(NOTE_CONTAINER_SELECTOR)) source = current;
    current = current.parentElement;
  }

  return source ?? target;
}

export function isBacklinkToSource(
  link: HTMLAnchorElement,
  sourceAnchor: HTMLElement | null,
): boolean {
  const href = link.getAttribute("href");
  if (!href || !sourceAnchor) return false;
  return normalizeId(getHashTargetId(href)) === normalizeId(sourceAnchor.id);
}
