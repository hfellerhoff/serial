import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type { DatabasePageCapture } from "~/server/db/schema";
import { bookmarkCapturesStore } from "~/lib/data/bookmarks/capture-store";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { mixedContentStore } from "~/lib/data/mixed-content/store";
import { getMixedContentMembershipRevision } from "~/lib/data/mixed-content/membershipRevision";
import {
  clearRetainedEntityPins,
  getRetainedEntityPins,
  setRetainedEntityPins,
} from "~/lib/data/page-retention";
import {
  useDeleteBookmarkMutation,
  useSaveBookmarkMutation,
  useSetBookmarkTagMutation,
  useSetBookmarkViewMutation,
  useUpdateBookmarkStateMutation,
} from "~/lib/data/bookmarks/mutations";

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => options,
}));

vi.mock("~/lib/orpc", () => {
  const mutationOptions = (options: unknown) => options;
  return {
    orpcRouterClient: {
      bookmark: {
        getCapture: vi.fn().mockResolvedValue(null),
      },
    },
    orpc: {
      bookmark: {
        remove: { mutationOptions },
        save: { mutationOptions },
        setTag: { mutationOptions },
        setView: { mutationOptions },
        updateState: { mutationOptions },
      },
    },
  };
});

const NOW = new Date("2026-08-19T12:00:00.000Z");

const CAPTURE: DatabasePageCapture = {
  bookmarkId: "bookmark-one",
  contentHtml: "<p>Retained capture</p>",
  contentHash: "capture-hash",
  captureSource: "server-static-fetch",
  extractorVersion: "test",
  sanitizerPolicyVersion: 1,
  capturedAt: NOW,
};

function bookmark(
  overrides: Partial<ApplicationBookmark> = {},
): ApplicationBookmark {
  return {
    id: "bookmark-one",
    userId: "user-one",
    sourceUrl: "https://example.com/article",
    effectiveUrl: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    platform: "website",
    contentType: "text",
    orientation: null,
    contentId: null,
    classificationSource: "url",
    classifierVersion: 1,
    isSaved: true,
    isRead: false,
    progress: 4,
    duration: 10,
    savedUpdatedAt: NOW,
    readUpdatedAt: NOW,
    progressUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    title: "Article",
    description: null,
    author: "Writer",
    siteName: "example.com",
    publishedAt: null,
    iconUrl: null,
    thumbnailUrl: null,
    previewSource: "url",
    captureHash: "capture-hash",
    capturedAt: NOW,
    viewIds: [10],
    tagIds: [],
    ...overrides,
  };
}

type MutationCallbacks<TInput, TResult, TContext> = {
  onMutate: (input: TInput) => TContext;
  onSuccess: (result: TResult, input: TInput, context: TContext) => void;
  onError: (error: unknown, input: TInput, context: TContext) => void;
};

function revision() {
  return getMixedContentMembershipRevision();
}

beforeEach(() => {
  bookmarksStore.getState().reset();
  mixedContentStore.getState().reset();
});

afterEach(() => {
  clearRetainedEntityPins("membership-revision:test");
});

describe("Bookmark mixed-content membership revision", () => {
  it("advances for save, status, View, Tag, delete, and rollback projection changes", () => {
    const original = bookmark();
    bookmarksStore.getState().upsert(original);
    setRetainedEntityPins("membership-revision:test", {
      bookmarkIds: [original.id],
    });
    let expectedRevision = revision();

    const stateMutation = useUpdateBookmarkStateMutation(
      original.id,
    ) as unknown as MutationCallbacks<
      { bookmarkId: string; isSaved: boolean },
      ApplicationBookmark,
      { previousBookmark?: ApplicationBookmark; token?: object }
    >;
    const stateInput = { bookmarkId: original.id, isSaved: false };
    const stateContext = stateMutation.onMutate(stateInput);
    expect(revision()).toBe(++expectedRevision);
    stateMutation.onError(new Error("failed"), stateInput, stateContext);
    expect(revision()).toBe(++expectedRevision);

    const viewMutation =
      useSetBookmarkViewMutation() as unknown as MutationCallbacks<
        { bookmarkId: string; viewId: number; assigned: boolean },
        ApplicationBookmark,
        { previousBookmark?: ApplicationBookmark; token?: object }
      >;
    const viewInput = { bookmarkId: original.id, viewId: 11, assigned: true };
    const viewContext = viewMutation.onMutate(viewInput);
    expect(revision()).toBe(++expectedRevision);
    viewMutation.onError(new Error("failed"), viewInput, viewContext);
    expect(revision()).toBe(++expectedRevision);

    const tagMutation =
      useSetBookmarkTagMutation() as unknown as MutationCallbacks<
        { bookmarkId: string; tagId: number; assigned: boolean },
        ApplicationBookmark,
        { previousBookmark?: ApplicationBookmark; token?: object }
      >;
    const tagInput = { bookmarkId: original.id, tagId: 20, assigned: true };
    const tagContext = tagMutation.onMutate(tagInput);
    expect(revision()).toBe(++expectedRevision);
    tagMutation.onError(new Error("failed"), tagInput, tagContext);
    expect(revision()).toBe(++expectedRevision);

    const deleteMutation =
      useDeleteBookmarkMutation() as unknown as MutationCallbacks<
        { bookmarkId: string },
        unknown,
        { previousBookmark?: ApplicationBookmark }
      >;
    const deleteInput = { bookmarkId: original.id };
    const deleteContext = deleteMutation.onMutate(deleteInput);
    expect(revision()).toBe(++expectedRevision);
    deleteMutation.onError(new Error("failed"), deleteInput, deleteContext);
    expect(revision()).toBe(++expectedRevision);

    const saveMutation =
      useSaveBookmarkMutation() as unknown as MutationCallbacks<
        unknown,
        {
          bookmark: ApplicationBookmark;
          removedBookmarkIds?: string[];
          removedBookmarkId?: string;
        },
        unknown
      >;
    saveMutation.onSuccess(
      { bookmark: bookmark({ id: "bookmark-two" }) },
      {},
      undefined,
    );
    expect(revision()).toBe(expectedRevision + 1);
  });

  it("does not advance for a progress-only write or response", () => {
    const original = bookmark();
    bookmarksStore.getState().upsert(original);
    setRetainedEntityPins("membership-revision:test", {
      bookmarkIds: [original.id],
    });
    const initialRevision = revision();
    const mutation = useUpdateBookmarkStateMutation(
      original.id,
    ) as unknown as MutationCallbacks<
      { bookmarkId: string; progress: number; duration: number },
      ApplicationBookmark,
      { previousBookmark?: ApplicationBookmark; token?: object }
    >;
    const input = { bookmarkId: original.id, progress: 8, duration: 12 };

    const context = mutation.onMutate(input);
    expect(revision()).toBe(initialRevision);
    mutation.onSuccess(
      bookmark({
        progress: 8,
        duration: 12,
        progressUpdatedAt: new Date(NOW.getTime() + 1),
        updatedAt: new Date(NOW.getTime() + 1),
      }),
      input,
      context,
    );

    expect(revision()).toBe(initialRevision);
  });

  it("restores a retained capture after a failed Archive", () => {
    const original = bookmark();
    bookmarksStore.getState().upsert(original);
    bookmarkCapturesStore.getState().upsert(CAPTURE);
    setRetainedEntityPins("membership-revision:test", {
      bookmarkIds: [original.id],
    });
    const mutation = useUpdateBookmarkStateMutation(
      original.id,
    ) as unknown as MutationCallbacks<
      { bookmarkId: string; isRead: boolean },
      ApplicationBookmark,
      {
        previousBookmark?: ApplicationBookmark;
        previousCapture?: DatabasePageCapture;
        token?: object;
      }
    >;
    const input = { bookmarkId: original.id, isRead: true };

    const context = mutation.onMutate(input);
    expect(
      bookmarkCapturesStore.getState().capturesDict[original.id],
    ).toBeUndefined();

    mutation.onError(new Error("failed"), input, context);

    expect(bookmarksStore.getState().getBookmark(original.id)?.isRead).toBe(
      false,
    );
    expect(bookmarkCapturesStore.getState().capturesDict[original.id]).toEqual(
      CAPTURE,
    );
  });

  it("drops a delayed progress response after the final body owner is released", () => {
    const original = bookmark({ tagIds: [20] });
    bookmarksStore.getState().upsert(original);
    setRetainedEntityPins("membership-revision:test", {
      bookmarkIds: [original.id],
    });
    mixedContentStore.getState().applyPage({
      scope: { type: "tag", tagId: 20 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      page: {
        references: [],
        bookmarks: [],
        feedItems: [],
        cursor: null,
        hasMore: false,
      },
      replacesScope: true,
    });
    const mutation = useUpdateBookmarkStateMutation(
      original.id,
    ) as unknown as MutationCallbacks<
      { bookmarkId: string; progress: number; duration: number },
      ApplicationBookmark,
      { previousBookmark?: ApplicationBookmark; token?: object }
    >;
    const input = { bookmarkId: original.id, progress: 8, duration: 12 };
    const initialRevision = revision();

    clearRetainedEntityPins("membership-revision:test");
    expect(bookmarksStore.getState().getBookmark(original.id)).toBeUndefined();
    const context = mutation.onMutate(input);
    mutation.onSuccess(
      bookmark({
        tagIds: [20],
        progress: 8,
        duration: 12,
        progressUpdatedAt: new Date(NOW.getTime() + 1),
        updatedAt: new Date(NOW.getTime() + 1),
      }),
      input,
      context,
    );

    expect(revision()).toBe(initialRevision);
    expect(bookmarksStore.getState().getBookmark(original.id)).toBeUndefined();
    expect(
      mixedContentStore.getState().scopes["tag:20:saved:unread"]?.references,
    ).toEqual([]);
  });

  it("pins a Bookmark body until an optimistic membership mutation settles", () => {
    const original = bookmark();
    bookmarksStore.getState().upsert(original);
    mixedContentStore.getState().applyPage({
      scope: { type: "view", viewId: 10 },
      contentStatus: { saveStatus: "saved", archiveStatus: "unread" },
      page: {
        references: [
          {
            entityKind: "bookmark",
            entityId: original.id,
            sectionPlacement: null,
            normalizedAt: original.savedUpdatedAt,
          },
        ],
        bookmarks: [original],
        feedItems: [],
        cursor: null,
        hasMore: false,
      },
      replacesScope: true,
    });
    const mutation = useUpdateBookmarkStateMutation(
      original.id,
    ) as unknown as MutationCallbacks<
      { bookmarkId: string; isSaved: boolean },
      ApplicationBookmark,
      { previousBookmark?: ApplicationBookmark; token?: object }
    >;
    const input = { bookmarkId: original.id, isSaved: false };

    const context = mutation.onMutate(input);
    expect(getRetainedEntityPins("bookmark")).toContain(original.id);
    expect(bookmarksStore.getState().getBookmark(original.id)).toBeDefined();

    mutation.onSuccess(
      bookmark({
        isSaved: false,
        savedUpdatedAt: new Date(NOW.getTime() + 1),
        updatedAt: new Date(NOW.getTime() + 1),
      }),
      input,
      context,
    );
    expect(getRetainedEntityPins("bookmark")).not.toContain(original.id);
    expect(bookmarksStore.getState().getBookmark(original.id)).toBeUndefined();
  });
});
