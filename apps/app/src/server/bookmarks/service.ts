import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { BOOKMARK_CAPTURE_LIMITS } from "./contracts";
import {
  buildUrlFallbackObservation,
  extractStaticCapture,
  prepareExtensionCapture,
} from "./extract";
import { fetchStaticHtml } from "./fetch";
import { captureLimiter } from "./limits";
import { normalizeBookmarkUrl } from "./url";
import type {
  BookmarkObservationResult,
  BookmarkSaveResult,
  CaptureFailureReason,
  ExtensionCaptureCandidate,
  TrustedBookmarkObservation,
  TrustedPageCapture,
} from "./contracts";
import type { db as defaultDb } from "~/server/db";
import type { DatabaseBookmark, DatabasePageCapture } from "~/server/db/schema";
import type {
  BookmarkClassification,
  BookmarkPreview,
} from "~/lib/content/classification";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
  contentCategories,
  pageCaptures,
  views,
} from "~/server/db/schema";
import {
  mergeClassification,
  mergePreview,
} from "~/lib/content/classification";
import { compareObservationSources } from "~/lib/content/descriptor";
import { canRetainPageCapture } from "~/lib/content/capabilities";

type BookmarkDatabase = typeof defaultDb;
type BookmarkQueryDatabase = Pick<
  BookmarkDatabase,
  "query" | "select" | "insert" | "update" | "delete"
>;

export class BookmarkNotFoundError extends Error {}

function captureValues(bookmarkId: string, capture: TrustedPageCapture) {
  return {
    bookmarkId,
    contentHtml: capture.contentHtml,
    contentHash: capture.contentHash,
    captureSource: capture.captureSource,
    extractorVersion: capture.extractorVersion,
    sanitizerPolicyVersion: capture.sanitizerPolicyVersion,
    capturedAt: capture.capturedAt,
  };
}

function captureOutcome(input: {
  observationResult: BookmarkObservationResult;
  existingCapture: DatabasePageCapture | undefined;
  captureAllowed: boolean;
}) {
  if (input.observationResult.observation.capture) {
    return { status: "captured" as const };
  }
  const reason =
    input.observationResult.captureFailureReason ?? "unextractable";
  return input.captureAllowed && input.existingCapture
    ? ({ status: "preserved", reason } as const)
    : ({ status: "unavailable", reason } as const);
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
  bookmarkId: string,
  capture: TrustedPageCapture,
) {
  const previousCapture = await findCapture(database, bookmarkId);
  const contentChanged = previousCapture?.contentHash !== capture.contentHash;
  await database
    .insert(pageCaptures)
    .values(captureValues(bookmarkId, capture))
    .onConflictDoUpdate({
      target: pageCaptures.bookmarkId,
      set: captureValues(bookmarkId, capture),
    });
  return contentChanged;
}

function bookmarkClassification(
  bookmark: DatabaseBookmark,
): BookmarkClassification {
  return {
    platform: bookmark.platform,
    contentType: bookmark.contentType,
    orientation: bookmark.orientation,
    contentId: bookmark.contentId,
    classificationSource: bookmark.classificationSource,
    classifierVersion: bookmark.classifierVersion,
  };
}

function bookmarkPreview(bookmark: DatabaseBookmark): BookmarkPreview {
  return {
    title: bookmark.title,
    description: bookmark.description,
    author: bookmark.author,
    siteName: bookmark.siteName,
    publishedAt: bookmark.publishedAt,
    thumbnailUrl: bookmark.thumbnailUrl,
    iconUrl: bookmark.iconUrl,
    previewSource: bookmark.previewSource,
  };
}

function storedBookmarkObservation(
  bookmark: DatabaseBookmark,
): TrustedBookmarkObservation {
  return {
    effectiveUrl: bookmark.effectiveUrl,
    canonicalUrl: bookmark.canonicalUrl,
    classification: bookmarkClassification(bookmark),
    preview: bookmarkPreview(bookmark),
    capture: null,
  };
}

function observationValues(input: {
  current?: DatabaseBookmark;
  sourceUrl: string;
  observation: TrustedBookmarkObservation;
}) {
  const classification = input.current
    ? mergeClassification(
        bookmarkClassification(input.current),
        input.observation.classification,
      )
    : input.observation.classification;
  const preview = input.current
    ? mergePreview(bookmarkPreview(input.current), {
        ...input.observation.preview,
        source: input.observation.preview.previewSource,
      })
    : input.observation.preview;
  const incomingIdentityWins =
    !input.current ||
    compareObservationSources(
      input.observation.classification.classificationSource,
      input.current.classificationSource,
    ) >= 0;
  return {
    sourceUrl: incomingIdentityWins
      ? input.sourceUrl
      : input.current!.sourceUrl,
    effectiveUrl: incomingIdentityWins
      ? input.observation.effectiveUrl
      : input.current!.effectiveUrl,
    canonicalUrl: incomingIdentityWins
      ? input.observation.canonicalUrl
      : input.current!.canonicalUrl,
    platform: classification.platform,
    contentType: classification.contentType,
    orientation: classification.orientation,
    contentId: classification.contentId,
    classificationSource: classification.classificationSource,
    classifierVersion: classification.classifierVersion,
    title: preview.title,
    description: preview.description,
    author: preview.author,
    siteName: preview.siteName,
    publishedAt: preview.publishedAt,
    thumbnailUrl: preview.thumbnailUrl,
    iconUrl: preview.iconUrl,
    previewSource: preview.previewSource,
  };
}

async function applyObservation(
  database: BookmarkQueryDatabase,
  input: {
    bookmark: DatabaseBookmark;
    sourceUrl: string;
    observationResult: BookmarkObservationResult;
    now: Date;
  },
) {
  const values = observationValues({
    current: input.bookmark,
    sourceUrl: input.sourceUrl,
    observation: input.observationResult.observation,
  });
  const captureAllowed = canRetainPageCapture(values);
  const existingCapture = await findCapture(database, input.bookmark.id);
  let captureChanged = false;
  if (!captureAllowed) {
    await database
      .delete(pageCaptures)
      .where(eq(pageCaptures.bookmarkId, input.bookmark.id));
  } else if (input.observationResult.observation.capture) {
    captureChanged = await replaceCapture(
      database,
      input.bookmark.id,
      input.observationResult.observation.capture,
    );
  }
  const bookmark = await database
    .update(bookmarks)
    .set({
      ...values,
      isSaved: true,
      savedUpdatedAt: input.now,
      ...(captureChanged
        ? { progress: 0, duration: 0, progressUpdatedAt: input.now }
        : {}),
      updatedAt: input.now,
    })
    .where(eq(bookmarks.id, input.bookmark.id))
    .returning()
    .get();
  return {
    bookmark,
    capture: captureOutcome({
      observationResult: input.observationResult,
      existingCapture,
      captureAllowed,
    }),
  };
}

async function consolidateBookmarks(
  database: BookmarkQueryDatabase,
  input: {
    candidates: DatabaseBookmark[];
    observationResult: BookmarkObservationResult;
    sourceUrl: string;
    now: Date;
  },
) {
  const ordered = [...input.candidates].sort((left, right) => {
    const createdDifference =
      left.createdAt.getTime() - right.createdAt.getTime();
    return createdDifference || left.id.localeCompare(right.id);
  });
  const survivor = ordered[0]!;
  const removed = ordered.slice(1);
  const candidateIds = ordered.map((bookmark) => bookmark.id);

  const [viewAssignments, tagAssignments, candidateCaptures] =
    await Promise.all([
      database
        .select({ viewId: bookmarkViews.viewId })
        .from(bookmarkViews)
        .where(inArray(bookmarkViews.bookmarkId, candidateIds)),
      database
        .select({ tagId: bookmarkTags.tagId })
        .from(bookmarkTags)
        .where(inArray(bookmarkTags.bookmarkId, candidateIds)),
      database
        .select()
        .from(pageCaptures)
        .where(inArray(pageCaptures.bookmarkId, candidateIds)),
    ]);
  const preservedCapture = [...candidateCaptures].sort((left, right) => {
    const sourceDifference = compareObservationSources(
      right.captureSource,
      left.captureSource,
    );
    return (
      sourceDifference || right.capturedAt.getTime() - left.capturedAt.getTime()
    );
  })[0];
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
      isRead: ordered.every((bookmark) => bookmark.isRead),
      readUpdatedAt: input.now,
    })
    .where(eq(bookmarks.id, survivor.id));
  let mergedSurvivor = survivor;
  for (const candidate of removed) {
    mergedSurvivor = {
      ...mergedSurvivor,
      ...observationValues({
        current: mergedSurvivor,
        sourceUrl: mergedSurvivor.sourceUrl,
        observation: storedBookmarkObservation(candidate),
      }),
    };
  }
  if (removed.length > 0) {
    await database.delete(bookmarks).where(
      inArray(
        bookmarks.id,
        removed.map((bookmark) => bookmark.id),
      ),
    );
  }
  if (preservedCapture && preservedCapture.bookmarkId !== survivor.id) {
    await replaceCapture(database, survivor.id, preservedCapture);
  }
  await database
    .update(bookmarks)
    .set({
      ...observationValues({
        current: survivor,
        sourceUrl: mergedSurvivor.sourceUrl,
        observation: storedBookmarkObservation(mergedSurvivor),
      }),
      isRead: ordered.every((bookmark) => bookmark.isRead),
      readUpdatedAt: input.now,
      progress: 0,
      duration: 0,
      progressUpdatedAt: input.now,
    })
    .where(eq(bookmarks.id, survivor.id));
  const refreshedSurvivor = await findOwnedBookmark(
    database,
    survivor.userId,
    survivor.id,
  );
  const applied = await applyObservation(database, {
    bookmark: refreshedSurvivor!,
    sourceUrl: input.sourceUrl,
    observationResult: input.observationResult,
    now: input.now,
  });

  return {
    ...applied,
    removedBookmarkIds: removed.map((bookmark) => bookmark.id),
  };
}

export async function persistBookmarkSave(input: {
  database: BookmarkDatabase;
  userId: string;
  sourceUrl: string;
  bookmarkId?: string;
  observationResult: BookmarkObservationResult;
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

    const { observation } = input.observationResult;
    const canonicalUrl = observation.canonicalUrl;
    const canonicalBookmark = await transaction.query.bookmarks.findFirst({
      where: and(
        eq(bookmarks.userId, input.userId),
        eq(bookmarks.canonicalUrl, canonicalUrl),
      ),
    });
    const identityBookmark = observation.classification.contentId
      ? await transaction.query.bookmarks.findFirst({
          where: and(
            eq(bookmarks.userId, input.userId),
            eq(bookmarks.platform, observation.classification.platform),
            eq(bookmarks.contentId, observation.classification.contentId),
          ),
        })
      : undefined;
    const candidates = [
      ...new Map(
        [hintedBookmark, identityBookmark, canonicalBookmark]
          .filter((bookmark): bookmark is DatabaseBookmark => Boolean(bookmark))
          .map((bookmark) => [bookmark.id, bookmark]),
      ).values(),
    ];
    const target = candidates[0];

    if (!target) {
      const created = await transaction
        .insert(bookmarks)
        .values({
          id: createId(),
          userId: input.userId,
          ...observationValues({ sourceUrl, observation }),
        })
        .returning()
        .get();
      const applied = await applyObservation(transaction, {
        bookmark: created,
        sourceUrl,
        observationResult: input.observationResult,
        now: new Date(),
      });
      return {
        disposition: "created",
        ...applied,
      };
    }

    if (candidates.length > 1) {
      const consolidated = await consolidateBookmarks(transaction, {
        candidates,
        observationResult: input.observationResult,
        sourceUrl,
        now: new Date(),
      });
      return {
        disposition: "consolidated",
        bookmark: consolidated.bookmark,
        capture: consolidated.capture,
        removedBookmarkId: consolidated.removedBookmarkIds[0],
        removedBookmarkIds: consolidated.removedBookmarkIds,
      };
    }

    const applied = await applyObservation(transaction, {
      bookmark: target,
      sourceUrl,
      observationResult: input.observationResult,
      now: new Date(),
    });
    return {
      disposition: "refreshed",
      ...applied,
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
      observationResult: {
        observation: buildUrlFallbackObservation(input.sourceUrl),
        captureFailureReason: lease.reason,
      },
    });
  }

  try {
    const attemptStartedAt = performance.now();
    const fetched = await fetchStaticHtml(input.sourceUrl);
    let observationResult = fetched.ok
      ? extractStaticCapture({
          sourceUrl: input.sourceUrl,
          effectiveUrl: fetched.effectiveUrl,
          html: fetched.html,
        })
      : {
          observation: buildUrlFallbackObservation(input.sourceUrl),
          captureFailureReason: fetched.reason,
        };
    if (
      performance.now() - attemptStartedAt >
      BOOKMARK_CAPTURE_LIMITS.totalAttemptMs
    ) {
      observationResult = {
        observation: buildUrlFallbackObservation(input.sourceUrl),
        captureFailureReason: "timeout",
      };
    }
    return persistBookmarkSave({ ...input, observationResult });
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
      observationResult: {
        observation: buildUrlFallbackObservation(input.sourceUrl),
        captureFailureReason: lease.reason,
      },
    });
  }
  try {
    if (!input.capture) {
      return persistBookmarkSave({
        ...input,
        observationResult: {
          observation: buildUrlFallbackObservation(input.sourceUrl),
          captureFailureReason: input.unsupportedContract
            ? "unsupported_capture_version"
            : (input.captureFailureReason ?? "unextractable"),
        },
      });
    }

    const prepared = prepareExtensionCapture({
      sourceUrl: input.sourceUrl,
      candidate: input.capture,
    });
    const observationResult =
      prepared.ok &&
      prepared.result.captureFailureReason === "unextractable" &&
      input.captureFailureReason
        ? {
            ...prepared.result,
            captureFailureReason: input.captureFailureReason,
          }
        : prepared.ok
          ? prepared.result
          : {
              observation: buildUrlFallbackObservation(input.sourceUrl),
              captureFailureReason: prepared.reason,
            };
    return persistBookmarkSave({
      ...input,
      observationResult,
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

export async function getBookmarkCaptures(input: {
  database: BookmarkDatabase;
  userId: string;
  bookmarkIds: string[];
}) {
  if (input.bookmarkIds.length === 0) return [];
  const rows = await input.database
    .select({ capture: pageCaptures })
    .from(bookmarks)
    .innerJoin(pageCaptures, eq(pageCaptures.bookmarkId, bookmarks.id))
    .where(
      and(
        inArray(bookmarks.id, input.bookmarkIds),
        eq(bookmarks.userId, input.userId),
      ),
    );
  return rows.map(({ capture }) => capture);
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

export async function updateBookmarksReadState(input: {
  database: BookmarkDatabase;
  userId: string;
  bookmarkIds: string[];
  isRead: boolean;
}) {
  const bookmarkIds = [...new Set(input.bookmarkIds)];
  if (bookmarkIds.length === 0) return [];
  const now = new Date();
  return input.database.transaction(async (transaction) => {
    const updated = await transaction
      .update(bookmarks)
      .set({ isRead: input.isRead, readUpdatedAt: now, updatedAt: now })
      .where(
        and(
          eq(bookmarks.userId, input.userId),
          inArray(bookmarks.id, bookmarkIds),
        ),
      )
      .returning();
    if (updated.length !== bookmarkIds.length) {
      throw new BookmarkNotFoundError("Bookmark not found");
    }
    return updated;
  });
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
    .returning({ id: bookmarks.id, canonicalUrl: bookmarks.canonicalUrl })
    .get();
  if (!deleted) throw new BookmarkNotFoundError("Bookmark not found");
  return deleted;
}
