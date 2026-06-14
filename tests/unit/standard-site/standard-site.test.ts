import { describe, expect, it } from "vitest";
import type { BlogPost, Release } from "content-collections";
import {
  buildDocumentLink,
  buildDocumentUri,
  buildGuideDocumentSource,
  buildPublicationLink,
  buildReleaseDocumentSource,
  createPublicationVerificationResponse,
  getDocumentRkey,
  parsePublicationUri,
  STANDARD_SITE,
} from "~/lib/standard-site";
import {
  assertStandardSiteSyncPlanIsSafe,
  buildDocumentRecord,
  buildPublicationRecord,
  markdownToPlaintext,
  planStandardSiteSync,
  STANDARD_SITE_SYNC_LIMITS,
} from "~/lib/standard-site/records";

const PUBLICATION_URI =
  "at://did:plc:serialtest/site.standard.publication/3mnvfqfsk22zc";

function makeRelease(overrides: Partial<Release> = {}): Release {
  return {
    slug: "2026-06-10",
    title: "View sections",
    description: "Custom view sections and better navigation.",
    publish_date: "2026-06-10",
    public: true,
    content:
      "## Features\n\n- **Fast** syncing\n- [Useful links](https://example.com)",
    excerpt: "",
    _meta: {
      filePath: "src/content/releases/2026-06-10.md",
      fileName: "2026-06-10.md",
      directory: "src/content/releases",
      path: "2026-06-10",
      extension: "md",
    },
    ...overrides,
  };
}

function makeGuide(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    slug: "export-youtube-subscriptions",
    title: "Export YouTube subscriptions",
    description: "A step-by-step export guide.",
    icon: "youtube",
    publish_date: "2026-06-11",
    updated_at: "2026-06-12",
    public: true,
    content: "## Steps\n\n1. Open Google Takeout.",
    excerpt: "",
    _meta: {
      filePath: "src/content/blog/export-youtube-subscriptions.md",
      fileName: "export-youtube-subscriptions.md",
      directory: "src/content/blog",
      path: "export-youtube-subscriptions",
      extension: "md",
    },
    ...overrides,
  };
}

describe("Standard.Site record builders", () => {
  it("builds the Serial publication", () => {
    expect(buildPublicationRecord()).toEqual({
      $type: "site.standard.publication",
      url: "https://serial.tube",
      name: "Serial",
      description: STANDARD_SITE.publicationDescription,
      preferences: { showInDiscover: true },
    });
  });

  it("builds a complete release document with plaintext content", () => {
    const record = buildDocumentRecord(
      buildReleaseDocumentSource(makeRelease()),
      PUBLICATION_URI,
    );

    expect(record).toEqual({
      $type: "site.standard.document",
      site: PUBLICATION_URI,
      title: "View sections",
      description: "Custom view sections and better navigation.",
      path: "/releases/2026-06-10",
      publishedAt: "2026-06-10T00:00:00.000Z",
      tags: ["release"],
      textContent: "Features\n\nFast syncing\nUseful links",
    });
  });

  it("builds a guide document with its updated timestamp", () => {
    expect(
      buildDocumentRecord(
        buildGuideDocumentSource(makeGuide()),
        PUBLICATION_URI,
      ),
    ).toEqual({
      $type: "site.standard.document",
      site: PUBLICATION_URI,
      title: "Export YouTube subscriptions",
      description: "A step-by-step export guide.",
      path: "/guides/export-youtube-subscriptions",
      publishedAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z",
      tags: ["guide"],
      textContent: "Steps\n\nOpen Google Takeout.",
    });
  });

  it("normalizes Markdown into plaintext without formatting or URLs", () => {
    expect(
      markdownToPlaintext(
        "# Heading\n\nA **bold** [link](https://example.com).\n\n\n\nLast line.",
      ),
    ).toBe("Heading\n\nA bold link.\n\nLast line.");
  });

  it("generates a stable valid TID and document URI", () => {
    const releaseDocument = buildReleaseDocumentSource(makeRelease());
    const rkey = getDocumentRkey(releaseDocument);

    expect(rkey).toMatch(
      /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/,
    );
    expect(rkey).toBe("3mnvfqgl3qyiy");
    expect(getDocumentRkey(releaseDocument)).toBe(rkey);
    expect(buildDocumentUri(PUBLICATION_URI, releaseDocument)).toBe(
      `at://did:plc:serialtest/site.standard.document/${rkey}`,
    );
  });

  it("rejects invalid publication URIs", () => {
    expect(() => parsePublicationUri("https://serial.tube/releases")).toThrow();
    expect(() =>
      parsePublicationUri(
        "at://did:plc:serialtest/site.standard.document/3mnvfqfsk22zc",
      ),
    ).toThrow();
  });
});

describe("Standard.Site web verification", () => {
  it("builds main-instance publication and document links", () => {
    const options = {
      isMainInstance: true,
      publicationUri: PUBLICATION_URI,
    };

    expect(buildPublicationLink(options)).toEqual({
      rel: "site.standard.publication",
      href: PUBLICATION_URI,
    });
    const releaseDocument = buildReleaseDocumentSource(makeRelease());
    expect(buildDocumentLink(releaseDocument, options)).toEqual({
      rel: "site.standard.document",
      href: buildDocumentUri(PUBLICATION_URI, releaseDocument),
    });
  });

  it("does not expose links outside the configured main instance", () => {
    expect(
      buildPublicationLink({
        isMainInstance: false,
        publicationUri: PUBLICATION_URI,
      }),
    ).toBeUndefined();
    expect(
      buildDocumentLink(buildReleaseDocumentSource(makeRelease()), {
        isMainInstance: true,
        publicationUri: undefined,
      }),
    ).toBeUndefined();
  });

  it("serves the publication URI as plain text only when enabled", async () => {
    const response = createPublicationVerificationResponse({
      isMainInstance: true,
      publicationUri: PUBLICATION_URI,
    });
    const missingResponse = createPublicationVerificationResponse({
      isMainInstance: false,
      publicationUri: PUBLICATION_URI,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toBe(PUBLICATION_URI);
    expect(missingResponse.status).toBe(404);
  });
});

describe("Standard.Site reconciliation", () => {
  it("creates the publication and documents for an empty repository", () => {
    const releaseDocument = buildReleaseDocumentSource(makeRelease());
    const guideDocument = buildGuideDocumentSource(makeGuide());
    const expectedReleaseRkey = getDocumentRkey(releaseDocument);
    const expectedGuideRkey = getDocumentRkey(guideDocument);

    const plan = planStandardSiteSync({
      documents: [releaseDocument, guideDocument],
      publicationUri: PUBLICATION_URI,
      existingPublications: [],
      existingDocuments: [],
    });

    expect(plan).toMatchObject({
      creates: 3,
      updates: 0,
      deletes: 0,
    });
    expect(plan.writes).toEqual([
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: STANDARD_SITE.publicationCollection,
        rkey: "3mnvfqfsk22zc",
        value: buildPublicationRecord(),
      },
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: STANDARD_SITE.documentCollection,
        rkey: expectedReleaseRkey,
        value: buildDocumentRecord(releaseDocument, PUBLICATION_URI),
      },
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: STANDARD_SITE.documentCollection,
        rkey: expectedGuideRkey,
        value: buildDocumentRecord(guideDocument, PUBLICATION_URI),
      },
    ]);
  });

  it("only updates changed records and deletes stale records for this publication", () => {
    const unchangedDocument = buildReleaseDocumentSource(makeRelease());
    const changedDocument = buildReleaseDocumentSource(
      makeRelease({
        slug: "2026-06-11",
        publish_date: "2026-06-11",
        title: "Updated title",
      }),
    );
    const unchangedRkey = getDocumentRkey(unchangedDocument);
    const changedRkey = getDocumentRkey(changedDocument);
    const changedRecord = buildDocumentRecord(changedDocument, PUBLICATION_URI);

    const plan = planStandardSiteSync({
      documents: [unchangedDocument, changedDocument],
      publicationUri: PUBLICATION_URI,
      existingPublications: [
        {
          uri: PUBLICATION_URI,
          value: buildPublicationRecord(),
        },
      ],
      existingDocuments: [
        {
          uri: `at://did:plc:serialtest/site.standard.document/${unchangedRkey}`,
          value: buildDocumentRecord(unchangedDocument, PUBLICATION_URI),
        },
        {
          uri: `at://did:plc:serialtest/site.standard.document/${changedRkey}`,
          value: { ...changedRecord, title: "Old title" },
        },
        {
          uri: "at://did:plc:serialtest/site.standard.document/3aaaaaaaaaaaa",
          value: { site: PUBLICATION_URI },
        },
        {
          uri: "at://did:plc:serialtest/site.standard.document/3bbbbbbbbbbbb",
          value: {
            site: "at://did:plc:serialtest/site.standard.publication/3cccccccccccc",
          },
        },
      ],
    });

    expect(plan).toMatchObject({
      creates: 0,
      updates: 1,
      deletes: 1,
    });
    expect(plan.writes).toEqual([
      {
        $type: "com.atproto.repo.applyWrites#update",
        collection: STANDARD_SITE.documentCollection,
        rkey: changedRkey,
        value: changedRecord,
      },
      {
        $type: "com.atproto.repo.applyWrites#delete",
        collection: STANDARD_SITE.documentCollection,
        rkey: "3aaaaaaaaaaaa",
      },
    ]);
  });

  it("coexists with other publications and their documents", () => {
    const plan = planStandardSiteSync({
      documents: [],
      publicationUri: PUBLICATION_URI,
      existingPublications: [
        {
          uri: "at://did:plc:serialtest/site.standard.publication/3aaaaaaaaaaaa",
          value: buildPublicationRecord(),
        },
      ],
      existingDocuments: [
        {
          uri: "at://did:plc:serialtest/site.standard.document/3bbbbbbbbbbbb",
          value: {
            site: "at://did:plc:serialtest/site.standard.publication/3aaaaaaaaaaaa",
          },
        },
      ],
    });

    expect(plan).toMatchObject({
      creates: 1,
      updates: 0,
      deletes: 0,
    });
    expect(plan.writes).toEqual([
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: STANDARD_SITE.publicationCollection,
        rkey: "3mnvfqfsk22zc",
        value: buildPublicationRecord(),
      },
    ]);
  });

  it("rejects a document record key owned by another publication", () => {
    const document = buildReleaseDocumentSource(makeRelease());
    const rkey = getDocumentRkey(document);

    expect(() =>
      planStandardSiteSync({
        documents: [document],
        publicationUri: PUBLICATION_URI,
        existingPublications: [],
        existingDocuments: [
          {
            uri: `at://did:plc:serialtest/site.standard.document/${rkey}`,
            value: {
              site: "at://did:plc:serialtest/site.standard.publication/3bbbbbbbbbbbb",
            },
          },
        ],
      }),
    ).toThrow(`record key ${rkey} belongs to another publication`);
  });

  it("rejects desired documents with colliding record keys", () => {
    const document = buildReleaseDocumentSource(makeRelease());

    expect(() =>
      planStandardSiteSync({
        documents: [document, document],
        publicationUri: PUBLICATION_URI,
        existingPublications: [],
        existingDocuments: [],
      }),
    ).toThrow("must have unique record keys");
  });

  it("rejects plans that exceed the PDS atomic write limit", () => {
    const writes = Array.from(
      { length: STANDARD_SITE_SYNC_LIMITS.maximumAtomicWrites + 1 },
      (_, index) => ({
        $type: "com.atproto.repo.applyWrites#delete" as const,
        collection: STANDARD_SITE.documentCollection,
        rkey: `record-${index}`,
      }),
    );

    expect(() =>
      assertStandardSiteSyncPlanIsSafe(
        {
          writes,
          creates: 0,
          updates: 0,
          deletes: writes.length,
        },
        { allowLargeDelete: true },
      ),
    ).toThrow("exceeding the PDS atomic limit");
  });

  it("requires an explicit override for large delete plans", () => {
    const deleteCount =
      STANDARD_SITE_SYNC_LIMITS.maximumDeletesWithoutOverride + 1;
    const writes = Array.from({ length: deleteCount }, (_, index) => ({
      $type: "com.atproto.repo.applyWrites#delete" as const,
      collection: STANDARD_SITE.documentCollection,
      rkey: `record-${index}`,
    }));
    const plan = {
      writes,
      creates: 0,
      updates: 0,
      deletes: deleteCount,
    };

    expect(() =>
      assertStandardSiteSyncPlanIsSafe(plan, { allowLargeDelete: false }),
    ).toThrow(`would delete ${deleteCount} documents`);
    expect(() =>
      assertStandardSiteSyncPlanIsSafe(plan, { allowLargeDelete: true }),
    ).not.toThrow();
  });
});
