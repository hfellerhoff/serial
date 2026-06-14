import { isDeepStrictEqual } from "node:util";
import { AtUri } from "@atproto/api";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { getDocumentRkey, parsePublicationUri, STANDARD_SITE } from ".";
import type { BlobRef, ComAtprotoRepoApplyWrites } from "@atproto/api";
import type { StandardSiteDocumentSource } from ".";

export type StandardSiteDocumentRecord = {
  $type: typeof STANDARD_SITE.documentCollection;
  site: string;
  title: string;
  path: string;
  publishedAt: string;
  tags: string[];
  textContent: string;
  description?: string;
  updatedAt?: string;
};

export type StandardSiteRecord = {
  uri: string;
  value: Record<string, unknown>;
};

export type StandardSiteSyncPlan = {
  writes: ComAtprotoRepoApplyWrites.InputSchema["writes"];
  creates: number;
  updates: number;
  deletes: number;
};

export const STANDARD_SITE_SYNC_LIMITS = {
  maximumAtomicWrites: 200,
  maximumDeletesWithoutOverride: 5,
} as const;

type MarkdownNode = {
  type?: string;
  children?: MarkdownNode[];
  value?: string;
};

export function buildPublicationRecord(icon: BlobRef) {
  return {
    $type: STANDARD_SITE.publicationCollection,
    url: STANDARD_SITE.publicationUrl,
    icon,
    name: STANDARD_SITE.publicationName,
    description: STANDARD_SITE.publicationDescription,
    preferences: {
      showInDiscover: true,
    },
  };
}

function renderBlockNode(node: MarkdownNode): string {
  if (node.type === "root") {
    return (
      node.children?.map(renderBlockNode).filter(Boolean).join("\n\n") ?? ""
    );
  }

  if (node.type === "list" || node.type === "table") {
    return node.children?.map(renderBlockNode).filter(Boolean).join("\n") ?? "";
  }

  if (node.type === "listItem") {
    return node.children?.map(renderBlockNode).filter(Boolean).join("\n") ?? "";
  }

  if (node.type === "blockquote") {
    return (
      node.children?.map(renderBlockNode).filter(Boolean).join("\n\n") ?? ""
    );
  }

  if (node.type === "code") return node.value ?? "";

  return toString(node, { includeHtml: false });
}

export function markdownToPlaintext(markdown: string) {
  const processor = unified().use(remarkParse).use(remarkGfm);
  const tree = processor.parse(markdown);

  return renderBlockNode(tree)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildDocumentRecord(
  document: StandardSiteDocumentSource,
  publicationUri: string,
): StandardSiteDocumentRecord {
  return {
    $type: STANDARD_SITE.documentCollection,
    site: publicationUri,
    title: document.title,
    path: document.path,
    publishedAt: document.publishedAt,
    tags: [...document.tags],
    textContent: markdownToPlaintext(document.markdownContent),
    ...(document.description ? { description: document.description } : {}),
    ...(document.updatedAt ? { updatedAt: document.updatedAt } : {}),
  };
}

function getRecordRkey(record: StandardSiteRecord) {
  return new AtUri(record.uri).rkey;
}

export function planStandardSiteSync(options: {
  documents: StandardSiteDocumentSource[];
  publicationUri: string;
  publicationIcon: BlobRef;
  existingPublications: StandardSiteRecord[];
  existingDocuments: StandardSiteRecord[];
}): StandardSiteSyncPlan {
  const desiredDocuments = options.documents.map((document) => ({
    rkey: getDocumentRkey(document),
    record: buildDocumentRecord(document, options.publicationUri),
  }));
  const desiredDocumentRkeys = new Set(
    desiredDocuments.map(({ rkey }) => rkey),
  );

  if (desiredDocumentRkeys.size !== desiredDocuments.length) {
    throw new Error("Standard.Site documents must have unique record keys.");
  }

  const existingDocumentsByRkey = new Map(
    options.existingDocuments.map((record) => [getRecordRkey(record), record]),
  );
  const conflictingDocument = desiredDocuments.find(({ rkey }) => {
    const existingDocument = existingDocumentsByRkey.get(rkey);
    return (
      existingDocument && existingDocument.value.site !== options.publicationUri
    );
  });

  if (conflictingDocument) {
    throw new Error(
      `Standard.Site document record key ${conflictingDocument.rkey} belongs to another publication.`,
    );
  }

  const writes: ComAtprotoRepoApplyWrites.InputSchema["writes"] = [];
  let creates = 0;
  let updates = 0;
  let deletes = 0;

  function planUpsert(
    collection: string,
    rkey: string,
    value: Record<string, unknown>,
    existingRecord?: StandardSiteRecord,
  ) {
    if (!existingRecord) {
      writes.push({
        $type: "com.atproto.repo.applyWrites#create",
        collection,
        rkey,
        value,
      });
      creates += 1;
      return;
    }

    if (isDeepStrictEqual(existingRecord.value, value)) return;

    writes.push({
      $type: "com.atproto.repo.applyWrites#update",
      collection,
      rkey,
      value,
    });
    updates += 1;
  }

  const { rkey: publicationRkey } = parsePublicationUri(options.publicationUri);
  const existingPublication = options.existingPublications.find(
    ({ uri }) => uri === options.publicationUri,
  );

  planUpsert(
    STANDARD_SITE.publicationCollection,
    publicationRkey,
    buildPublicationRecord(options.publicationIcon),
    existingPublication,
  );

  for (const { rkey, record } of desiredDocuments) {
    planUpsert(
      STANDARD_SITE.documentCollection,
      rkey,
      record,
      existingDocumentsByRkey.get(rkey),
    );
  }

  for (const existingDocument of options.existingDocuments) {
    if (existingDocument.value.site !== options.publicationUri) continue;

    const rkey = getRecordRkey(existingDocument);
    if (desiredDocumentRkeys.has(rkey)) continue;

    writes.push({
      $type: "com.atproto.repo.applyWrites#delete",
      collection: STANDARD_SITE.documentCollection,
      rkey,
    });
    deletes += 1;
  }

  return {
    writes,
    creates,
    updates,
    deletes,
  };
}

export function assertStandardSiteSyncPlanIsSafe(
  plan: StandardSiteSyncPlan,
  options: { allowLargeDelete: boolean },
) {
  if (plan.writes.length > STANDARD_SITE_SYNC_LIMITS.maximumAtomicWrites) {
    throw new Error(
      `Standard.Site sync requires ${plan.writes.length} writes, exceeding the PDS atomic limit of ${STANDARD_SITE_SYNC_LIMITS.maximumAtomicWrites}. Split the content change into smaller atomic syncs.`,
    );
  }

  const isLargeDelete =
    plan.deletes > STANDARD_SITE_SYNC_LIMITS.maximumDeletesWithoutOverride;
  if (isLargeDelete && !options.allowLargeDelete) {
    throw new Error(
      `Standard.Site sync would delete ${plan.deletes} documents. Re-run with --allow-large-delete after reviewing the dry-run output.`,
    );
  }
}
