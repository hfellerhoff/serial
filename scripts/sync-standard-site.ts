import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AtpAgent } from "@atproto/api";
import { createBuilder } from "@content-collections/core";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import {
  buildGuideDocumentSource,
  buildReleaseDocumentSource,
  parsePublicationUri,
  STANDARD_SITE,
} from "../src/lib/standard-site";
import {
  assertStandardSiteSyncPlanIsSafe,
  planStandardSiteSync,
} from "../src/lib/standard-site/records";
import type { StandardSiteRecord } from "../src/lib/standard-site/records";

const syncEnv = createEnv({
  server: {
    STANDARD_SITE_PDS_URL: z.url(),
    STANDARD_SITE_IDENTIFIER: z.string().min(1),
    STANDARD_SITE_APP_PASSWORD: z.string().min(1),
    VITE_PUBLIC_STANDARD_SITE_PUBLICATION_URI: z.string().min(1),
  },
  runtimeEnv: {
    STANDARD_SITE_PDS_URL: process.env.STANDARD_SITE_PDS_URL,
    STANDARD_SITE_IDENTIFIER: process.env.STANDARD_SITE_IDENTIFIER,
    STANDARD_SITE_APP_PASSWORD: process.env.STANDARD_SITE_APP_PASSWORD,
    VITE_PUBLIC_STANDARD_SITE_PUBLICATION_URI:
      process.env.VITE_PUBLIC_STANDARD_SITE_PUBLICATION_URI,
  },
  emptyStringAsUndefined: true,
});

const isDryRun = process.argv.includes("--dry-run");
const allowLargeDelete = process.argv.includes("--allow-large-delete");
const publicationUri = syncEnv.VITE_PUBLIC_STANDARD_SITE_PUBLICATION_URI;
const publication = parsePublicationUri(publicationUri);
const publicationIcon = {
  mimeType: "image/png",
  url: new URL("../public/icon-256.png", import.meta.url),
} as const;

async function loadDocuments() {
  const contentCollectionsConfigPath = fileURLToPath(
    new URL("../content-collections.ts", import.meta.url),
  );
  const builder = await createBuilder(contentCollectionsConfigPath);
  await builder.build();

  const { allBlogPosts, allReleases } = await import("content-collections");
  const releaseDocuments = allReleases
    .filter((release) => release.public)
    .map(buildReleaseDocumentSource);
  const guideDocuments = allBlogPosts
    .filter((guide) => guide.public)
    .map(buildGuideDocumentSource);

  return [...releaseDocuments, ...guideDocuments].sort((a, b) =>
    a.publishedAt.localeCompare(b.publishedAt),
  );
}

async function listRecords(agent: AtpAgent, repo: string, collection: string) {
  const records: StandardSiteRecord[] = [];
  let cursor: string | undefined;

  do {
    const response = await agent.com.atproto.repo.listRecords({
      repo,
      collection,
      limit: 100,
      cursor,
    });

    records.push(...response.data.records);
    cursor = response.data.cursor;
  } while (cursor);

  return records;
}

async function syncStandardSite() {
  const documents = await loadDocuments();
  const agent = new AtpAgent({ service: syncEnv.STANDARD_SITE_PDS_URL });
  await agent.login({
    identifier: syncEnv.STANDARD_SITE_IDENTIFIER,
    password: syncEnv.STANDARD_SITE_APP_PASSWORD,
  });

  if (agent.did !== publication.did) {
    throw new Error(
      `Authenticated DID ${agent.did ?? "(missing)"} does not match publication DID ${publication.did}.`,
    );
  }

  const publicationIconBytes = await readFile(publicationIcon.url);
  const publicationIconResponse = await agent.uploadBlob(publicationIconBytes, {
    encoding: publicationIcon.mimeType,
  });
  const [existingPublications, existingDocuments] = await Promise.all([
    listRecords(agent, publication.did, STANDARD_SITE.publicationCollection),
    listRecords(agent, publication.did, STANDARD_SITE.documentCollection),
  ]);
  const plan = planStandardSiteSync({
    documents,
    publicationUri,
    publicationIcon: publicationIconResponse.data.blob,
    existingPublications,
    existingDocuments,
  });

  if (!isDryRun) {
    assertStandardSiteSyncPlanIsSafe(plan, { allowLargeDelete });
  }

  console.log(
    `${isDryRun ? "Would apply" : "Applying"} ${plan.creates} creates, ${plan.updates} updates, and ${plan.deletes} deletes.`,
  );

  if (isDryRun) {
    for (const write of plan.writes) {
      const operation = write.$type.split("#").at(-1)?.toUpperCase();
      console.log(`${operation} ${write.collection}/${write.rkey}`);
    }
    return;
  }

  if (!plan.writes.length) return;

  await agent.com.atproto.repo.applyWrites({
    repo: publication.did,
    writes: plan.writes,
  });
}

await syncStandardSite();
