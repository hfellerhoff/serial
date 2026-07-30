import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { BOOKMARK_CAPTURE_LIMITS } from "./contracts";
import { extractStaticCapture, prepareExtensionCapture } from "./extract";
import { fetchStaticHtml } from "./fetch";
import { captureLimiter } from "./limits";
import { chooseCanonicalUrl, normalizeBookmarkUrl } from "./url";
import type {
  BookmarkSaveResult,
  CaptureFailureReason,
  ExtensionCaptureCandidate,
  TrustedCapture,
} from "./contracts";
import type { db as defaultDb } from "~/server/db";
import type { DatabaseBookmark, DatabasePageCapture } from "~/server/db/schema";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
  contentCategories,
  pageCaptures,
  views,
} from "~/server/db/schema";

type BookmarkDatabase = typeof defaultDb;
type BookmarkQueryDatabase = Pick<
  BookmarkDatabase,
  "query" | "select" | "insert" | "update" | "delete"
>;

type CaptureAttempt =
  | { ok: true; capture: TrustedCapture }
  | { ok: false; reason: CaptureFailureReason };

export class BookmarkNotFoundError extends Error {}

function captureValues(bookmarkId: string, capture: TrustedCapture) {
  return {
    bookmarkId,
    title: capture.title,
    author: capture.author,
    publishedAt: capture.publishedAt,
    contentHtml: capture.contentHtml,
    effectiveUrl: capture.effectiveUrl,
    iconUrl: capture.iconUrl,
    representativeImageUrl: capture.representativeImageUrl,
    contentHash: capture.contentHash,
    captureSource: capture.captureSource,
    extractorVersion: capture.extractorVersion,
    sanitizerPolicyVersion: capture.sanitizerPolicyVersion,
    capturedAt: capture.capturedAt,
  };
}

function captureOutcome(
  captureAttempt: CaptureAttempt,
  existingCapture: DatabasePageCapture | undefined,
) {
  if (captureAttempt.ok) return { status: "captured" as const };
  return existingCapture
    ? ({ status: "preserved", reason: captureAttempt.reason } as const)
    : ({ status: "unavailable", reason: captureAttempt.reason } as const);
}

async function findOwnedBookmark(
  database: BookmarkQueryDatabase,
  userId: string,
  bookmarkId: string,
) {
  return database.query.bookmarks.findFirst({
    where: and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)),
  });
}

async function findCapture(
  database: BookmarkQueryDatabase,
  bookmarkId: string,
) {
  return database.query.pageCaptures.findFirst({
    where: eq(pageCaptures.bookmarkId, bookmarkId),
  });
}

async function replaceCapture(
  database: BookmarkQueryDatabase,
  bookmark: DatabaseBookmark,
  capture: TrustedCapture,
  sourceUrl: string,
  now: Date,
) {
  const previousCapture = await findCapture(database, bookmark.id);
  const contentChanged = previousCapture?.contentHash !== capture.contentHash;
  await database
    .insert(pageCaptures)
    .values(captureValues(bookmark.id, capture))
    .onConflictDoUpdate({
      target: pageCaptures.bookmarkId,
      set: captureValues(bookmark.id, capture),
    });
  return database
    .update(bookmarks)
    .set({
      sourceUrl,
      canonicalUrl: capture.canonicalUrl,
      isSaved: true,
      savedUpdatedAt: now,
      ...(contentChanged
        ? { progress: 0, duration: 0, progressUpdatedAt: now }
        : {}),
      updatedAt: now,
    })
    .where(eq(bookmarks.id, bookmark.id))
    .returning()
    .get();
}

async function consolidateBookmarks(
  database: BookmarkQueryDatabase,
  input: {
    first: DatabaseBookmark;
    second: DatabaseBookmark;
    capture: TrustedCapture;
    sourceUrl: string;
    now: Date;
  },
) {
  const ordered = [input.first, input.second].sort((left, right) => {
    const createdDifference =
      left.createdAt.getTime() - right.createdAt.getTime();
    return createdDifference || left.id.localeCompare(right.id);
  });
  const survivor = ordered[0]!;
  const removed = ordered[1]!;

  const [viewAssignments, tagAssignments] = await Promise.all([
    database
      .select({ viewId: bookmarkViews.viewId })
      .from(bookmarkViews)
      .where(inArray(bookmarkViews.bookmarkId, [survivor.id, removed.id])),
    database
      .select({ tagId: bookmarkTags.tagId })
      .from(bookmarkTags)
      .where(inArray(bookmarkTags.bookmarkId, [survivor.id, removed.id])),
  ]);
  const uniqueViewIds = [
    ...new Set(viewAssignments.map(({ viewId }) => viewId)),
  ];
  const uniqueTagIds = [...new Set(tagAssignments.map(({ tagId }) => tagId))];

  if (uniqueViewIds.length > 0) {
    await database
      .insert(bookmarkViews)
      .values(
        uniqueViewIds.map((viewId) => ({ bookmarkId: survivor.id, viewId })),
      )
      .onConflictDoNothing();
  }
  if (uniqueTagIds.length > 0) {
    await database
      .insert(bookmarkTags)
      .values(uniqueTagIds.map((tagId) => ({ bookmarkId: survivor.id, tagId })))
      .onConflictDoNothing();
  }

  await database
    .update(bookmarks)
    .set({
      isRead: survivor.isRead && removed.isRead,
      readUpdatedAt: input.now,
    })
    .where(eq(bookmarks.id, survivor.id));
  await database.delete(bookmarks).where(eq(bookmarks.id, removed.id));
  const updatedSurvivor = await replaceCapture(
    database,
    survivor,
    input.capture,
    input.sourceUrl,
    input.now,
  );

  return { survivor: updatedSurvivor, removedBookmarkId: removed.id };
}

export async function persistBookmarkSave(input: {
  database: BookmarkDatabase;
  userId: string;
  sourceUrl: string;
  bookmarkId?: string;
  captureAttempt: CaptureAttempt;
}): Promise<BookmarkSaveResult<DatabaseBookmark>> {
  const { database } = input;
  const sourceUrl = normalizeBookmarkUrl(input.sourceUrl);

  return database.transaction(async (transaction) => {
    const hintedBookmark = input.bookmarkId
      ? await findOwnedBookmark(transaction, input.userId, input.bookmarkId)
      : undefined;
    if (input.bookmarkId && !hintedBookmark) {
      throw new BookmarkNotFoundError("Bookmark not found");
    }

    const canonicalUrl = input.captureAttempt.ok
      ? input.captureAttempt.capture.canonicalUrl
      : chooseCanonicalUrl({ sourceUrl });
    const canonicalBookmark = await transaction.query.bookmarks.findFirst({
      where: and(
        eq(bookmarks.userId, input.userId),
        eq(bookmarks.canonicalUrl, canonicalUrl),
      ),
    });
    const target = hintedBookmark ?? canonicalBookmark;

    if (!target) {
      const created = await transaction
        .insert(bookmarks)
        .values({
          id: createId(),
          userId: input.userId,
          sourceUrl,
          canonicalUrl,
        })
        .returning()
        .get();
      if (input.captureAttempt.ok) {
        const bookmark = await replaceCapture(
          transaction,
          created,
          input.captureAttempt.capture,
          sourceUrl,
          new Date(),
        );
        return {
          disposition: "created",
          bookmark,
          capture: { status: "captured" },
        };
      }
      return {
        disposition: "created",
        bookmark: created,
        capture: {
          status: "unavailable",
          reason: input.captureAttempt.reason,
        },
      };
    }

    const previousCapture = await findCapture(transaction, target.id);
    if (!input.captureAttempt.ok) {
      const bookmark = await transaction
        .update(bookmarks)
        .set({
          isSaved: true,
          savedUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bookmarks.id, target.id))
        .returning()
        .get();
      return {
        disposition: "refreshed",
        bookmark,
        capture: captureOutcome(input.captureAttempt, previousCapture),
      };
    }

    if (
      hintedBookmark &&
      canonicalBookmark &&
      hintedBookmark.id !== canonicalBookmark.id
    ) {
      const consolidated = await consolidateBookmarks(transaction, {
        first: hintedBookmark,
        second: canonicalBookmark,
        capture: input.captureAttempt.capture,
        sourceUrl,
        now: new Date(),
      });
      return {
        disposition: "consolidated",
        bookmark: consolidated.survivor,
        capture: { status: "captured" },
        removedBookmarkId: consolidated.removedBookmarkId,
      };
    }

    const bookmark = await replaceCapture(
      transaction,
      target,
      input.captureAttempt.capture,
      sourceUrl,
      new Date(),
    );
    return {
      disposition: "refreshed",
      bookmark,
      capture: { status: "captured" },
    };
  });
}

export async function saveBookmarkFromApp(input: {
  database: BookmarkDatabase;
  userId: string;
  sourceUrl: string;
  bookmarkId?: string;
}) {
  normalizeBookmarkUrl(input.sourceUrl);
  const lease = captureLimiter.acquire(input.userId, "app");
  if (!lease.ok) {
    return persistBookmarkSave({
      ...input,
      captureAttempt: { ok: false, reason: lease.reason },
    });
  }

  try {
    const attemptStartedAt = performance.now();
    const fetched = await fetchStaticHtml(input.sourceUrl);
    let captureAttempt = fetched.ok
      ? extractStaticCapture({
          sourceUrl: input.sourceUrl,
          effectiveUrl: fetched.effectiveUrl,
          html: fetched.html,
        })
      : fetched;
    if (
      performance.now() - attemptStartedAt >
      BOOKMARK_CAPTURE_LIMITS.totalAttemptMs
    ) {
      captureAttempt = { ok: false, reason: "timeout" };
    }
    return persistBookmarkSave({ ...input, captureAttempt });
  } finally {
    lease.release();
  }
}

export async function saveBookmarkFromExtension(input: {
  database: BookmarkDatabase;
  userId: string;
  sourceUrl: string;
  bookmarkId?: string;
  capture?: ExtensionCaptureCandidate;
  unsupportedContract?: boolean;
  captureFailureReason?: CaptureFailureReason;
}) {
  normalizeBookmarkUrl(input.sourceUrl);
  const lease = captureLimiter.acquire(input.userId, "extension");
  if (!lease.ok) {
    return persistBookmarkSave({
      ...input,
      captureAttempt: { ok: false, reason: lease.reason },
    });
  }
  try {
    if (!input.capture) {
      return persistBookmarkSave({
        ...input,
        captureAttempt: {
          ok: false,
          reason: input.unsupportedContract
            ? "unsupported_capture_version"
            : (input.captureFailureReason ?? "unextractable"),
        },
      });
    }

    return persistBookmarkSave({
      ...input,
      captureAttempt: prepareExtensionCapture({
        sourceUrl: input.sourceUrl,
        candidate: input.capture,
      }),
    });
  } finally {
    lease.release();
  }
}

export async function getBookmarkCapture(input: {
  database: BookmarkDatabase;
  userId: string;
  bookmarkId: string;
  contentHash?: string;
}) {
  const { database } = input;
  const row = await database
    .select({ bookmark: bookmarks, capture: pageCaptures })
    .from(bookmarks)
    .leftJoin(pageCaptures, eq(pageCaptures.bookmarkId, bookmarks.id))
    .where(
      and(
        eq(bookmarks.id, input.bookmarkId),
        eq(bookmarks.userId, input.userId),
      ),
    )
    .get();
  if (!row?.capture) return null;
  if (input.contentHash === row.capture.contentHash) {
    return {
      status: "not-modified" as const,
      contentHash: row.capture.contentHash,
    };
  }
  return { status: "capture" as const, capture: row.capture };
}

export async function updateBookmarkState(input: {
  database: BookmarkDatabase;
  userId: string;
  bookmarkId: string;
  isSaved?: boolean;
  isRead?: boolean;
  progress?: number;
  duration?: number;
}) {
  const { database } = input;
  if ((input.progress === undefined) !== (input.duration === undefined)) {
    throw new Error("Progress and duration must be updated together");
  }
  if (
    input.progress !== undefined &&
    (!Number.isInteger(input.progress) ||
      !Number.isInteger(input.duration) ||
      input.progress < 0 ||
      input.duration! < 0)
  ) {
    throw new Error("Progress and duration must be non-negative integers");
  }

  const now = new Date();
  const updated = await database
    .update(bookmarks)
    .set({
      ...(input.isSaved !== undefined
        ? { isSaved: input.isSaved, savedUpdatedAt: now }
        : {}),
      ...(input.isRead !== undefined
        ? { isRead: input.isRead, readUpdatedAt: now }
        : {}),
      ...(input.progress !== undefined
        ? {
            progress: input.progress,
            duration: input.duration,
            progressUpdatedAt: now,
          }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(bookmarks.id, input.bookmarkId),
        eq(bookmarks.userId, input.userId),
      ),
    )
    .returning()
    .get();
  if (!updated) throw new BookmarkNotFoundError("Bookmark not found");
  return updated;
}

async function verifyOrganizationOwnership(input: {
  database: BookmarkQueryDatabase;
  userId: string;
  bookmarkId: string;
  viewId?: number;
  tagId?: number;
}) {
  const [bookmark, organization] = await Promise.all([
    findOwnedBookmark(input.database, input.userId, input.bookmarkId),
    input.viewId !== undefined
      ? input.database.query.views.findFirst({
          where: and(
            eq(views.id, input.viewId),
            eq(views.userId, input.userId),
          ),
        })
      : input.database.query.contentCategories.findFirst({
          where: and(
            eq(contentCategories.id, input.tagId!),
            eq(contentCategories.userId, input.userId),
          ),
        }),
  ]);
  if (!bookmark || !organization)
    throw new BookmarkNotFoundError("Organization target not found");
}

export async function setBookmarkView(input: {
  database: BookmarkDatabase;
  userId: string;
  bookmarkId: string;
  viewId: number;
  assigned: boolean;
}) {
  const { database } = input;
  await verifyOrganizationOwnership(input);
  if (input.assigned) {
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: input.bookmarkId, viewId: input.viewId })
      .onConflictDoNothing();
  } else {
    await database
      .delete(bookmarkViews)
      .where(
        and(
          eq(bookmarkViews.bookmarkId, input.bookmarkId),
          eq(bookmarkViews.viewId, input.viewId),
        ),
      );
  }
}

export async function setBookmarkTag(input: {
  database: BookmarkDatabase;
  userId: string;
  bookmarkId: string;
  tagId: number;
  assigned: boolean;
}) {
  const { database } = input;
  await verifyOrganizationOwnership(input);
  if (input.assigned) {
    await database
      .insert(bookmarkTags)
      .values({ bookmarkId: input.bookmarkId, tagId: input.tagId })
      .onConflictDoNothing();
  } else {
    await database
      .delete(bookmarkTags)
      .where(
        and(
          eq(bookmarkTags.bookmarkId, input.bookmarkId),
          eq(bookmarkTags.tagId, input.tagId),
        ),
      );
  }
}

export async function deleteBookmark(input: {
  database: BookmarkDatabase;
  userId: string;
  bookmarkId: string;
}) {
  const { database } = input;
  const deleted = await database
    .delete(bookmarks)
    .where(
      and(
        eq(bookmarks.id, input.bookmarkId),
        eq(bookmarks.userId, input.userId),
      ),
    )
    .returning({ id: bookmarks.id })
    .get();
  if (!deleted) throw new BookmarkNotFoundError("Bookmark not found");
  return deleted;
}
