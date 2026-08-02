import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookmarkMutationCoordinator,
  bookmarkMembershipChange,
} from "@serial/bookmark-capture";
import type { ExtensionAuthSession } from "../../lib/auth";
import type {
  BookmarkMessage,
  BookmarkMessageResponse,
  BookmarkWorkspace,
  ExtensionBookmark,
} from "../../lib/bookmarks";

type WorkspaceStatus =
  "loading" | "base" | "ineligible" | "saved" | "removed" | "error";

export type FeedDiscoveryStatus = "idle" | "loading" | "loaded" | "error";

async function sendBookmarkMessage(message: BookmarkMessage) {
  const response = (await browser.runtime.sendMessage(
    message,
  )) as BookmarkMessageResponse;
  if (!response || typeof response.ok !== "boolean") {
    throw new Error("Unable to contact the Serial extension background");
  }
  return response;
}

export function useBookmarkWorkspace(input: {
  session: ExtensionAuthSession;
  onAuthExpired: () => void;
}) {
  const [status, setStatus] = useState<WorkspaceStatus>("loading");
  const [workspace, setWorkspace] = useState<BookmarkWorkspace | null>(null);
  const [feedDiscoveryStatus, setFeedDiscoveryStatus] =
    useState<FeedDiscoveryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingOrganization, setPendingOrganization] = useState<string[]>([]);
  const [pendingFeedUrls, setPendingFeedUrls] = useState<string[]>([]);
  const [addedFeedUrls, setAddedFeedUrls] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const attemptedToken = useRef<string | null>(null);
  const feedDiscoveryGeneration = useRef(0);
  const workspaceRef = useRef<BookmarkWorkspace | null>(null);
  const pendingOrganizationRef = useRef<Set<string> | null>(null);
  if (pendingOrganizationRef.current === null) {
    pendingOrganizationRef.current = new Set<string>();
  }
  const pendingOrganizationKeys = pendingOrganizationRef.current;
  const mutationCoordinatorRef =
    useRef<BookmarkMutationCoordinator<ExtensionBookmark> | null>(null);
  if (mutationCoordinatorRef.current === null) {
    mutationCoordinatorRef.current =
      new BookmarkMutationCoordinator<ExtensionBookmark>();
  }
  const mutationCoordinator = mutationCoordinatorRef.current;
  const { onAuthExpired, session } = input;

  const replaceWorkspace = useCallback((next: BookmarkWorkspace | null) => {
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);

  const markOrganizationPending = useCallback(
    (key: string, pending: boolean) => {
      if (pending) pendingOrganizationKeys.add(key);
      else pendingOrganizationKeys.delete(key);
      setPendingOrganization([...pendingOrganizationKeys]);
    },
    [pendingOrganizationKeys],
  );

  const handleFailure = useCallback(
    (response: Extract<BookmarkMessageResponse, { ok: false }>) => {
      if (response.authExpired) {
        onAuthExpired();
        return;
      }
      setError(response.error);
      setStatus("error");
    },
    [onAuthExpired],
  );

  const discoverFeeds = useCallback(
    async (savedWorkspace: BookmarkWorkspace, generation: number) => {
      setFeedDiscoveryStatus("loading");
      try {
        const response = await sendBookmarkMessage({
          type: "bookmark.discover-feeds",
          sourceUrl: savedWorkspace.bookmark.sourceUrl,
        });
        if (feedDiscoveryGeneration.current !== generation) return;
        if (!response.ok) {
          if (response.authExpired) onAuthExpired();
          setFeedDiscoveryStatus("error");
          return;
        }
        if (response.status !== "feeds-discovered") {
          throw new Error("Serial returned an unexpected Feed-discovery state");
        }
        const currentWorkspace = workspaceRef.current;
        if (currentWorkspace?.bookmark.id === savedWorkspace.bookmark.id) {
          replaceWorkspace({ ...currentWorkspace, feeds: response.feeds });
        }
        setFeedDiscoveryStatus("loaded");
      } catch {
        if (feedDiscoveryGeneration.current === generation) {
          setFeedDiscoveryStatus("error");
        }
      }
    },
    [onAuthExpired, replaceWorkspace],
  );

  const captureActive = useCallback(async () => {
    const generation = feedDiscoveryGeneration.current + 1;
    feedDiscoveryGeneration.current = generation;
    setStatus("loading");
    setFeedDiscoveryStatus("idle");
    setError(null);
    try {
      const response = await sendBookmarkMessage({
        type: "bookmark.capture-active",
      });
      if (!response.ok) return handleFailure(response);
      if (response.status === "base" || response.status === "ineligible") {
        replaceWorkspace(null);
        setStatus(response.status);
        return;
      }
      if (response.status !== "saved") {
        throw new Error("Serial returned an unexpected Bookmark state");
      }
      replaceWorkspace(response.workspace);
      setStatus("saved");
      if (response.workspace.feeds.length > 0) {
        setFeedDiscoveryStatus("loaded");
      } else {
        void discoverFeeds(response.workspace, generation);
      }
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Unable to save this Bookmark",
      );
      setStatus("error");
    }
  }, [discoverFeeds, handleFailure, replaceWorkspace]);

  useEffect(() => {
    if (attemptedToken.current === session.token) return;
    attemptedToken.current = session.token;
    void captureActive();
  }, [captureActive, session.token]);

  const toggleOrganization = useCallback(
    async (kind: "view" | "tag", id: number) => {
      const currentWorkspace = workspaceRef.current;
      if (!currentWorkspace) return;
      const key = `${kind}:${id}`;
      if (pendingOrganizationKeys.has(key)) return;
      const idField = kind === "view" ? "viewIds" : "tagIds";
      const assigned = !currentWorkspace.bookmark[idField].includes(id);
      const previousBookmark = currentWorkspace.bookmark;
      const token = mutationCoordinator.begin(previousBookmark.id, [
        bookmarkMembershipChange(kind, id, assigned),
      ]);
      replaceWorkspace({
        ...currentWorkspace,
        bookmark: mutationCoordinator.apply(previousBookmark, token),
      });
      markOrganizationPending(key, true);
      setError(null);
      try {
        const response = await sendBookmarkMessage(
          kind === "view"
            ? {
                type: "bookmark.set-view",
                bookmarkId: previousBookmark.id,
                viewId: id,
                assigned,
              }
            : {
                type: "bookmark.set-tag",
                bookmarkId: previousBookmark.id,
                tagId: id,
                assigned,
              },
        );
        if (!response.ok) {
          const current = workspaceRef.current;
          if (current) {
            replaceWorkspace({
              ...current,
              bookmark: mutationCoordinator.rollback(
                current.bookmark,
                previousBookmark,
                token,
              ),
            });
          }
          if (response.authExpired) onAuthExpired();
          else setError(response.error);
          return;
        }
        if (response.status === "updated") {
          const current = workspaceRef.current;
          if (current) {
            replaceWorkspace({
              ...current,
              bookmark: mutationCoordinator.reconcile(
                current.bookmark,
                response.bookmark,
                token,
              ),
            });
          }
        }
      } catch {
        const current = workspaceRef.current;
        if (current) {
          replaceWorkspace({
            ...current,
            bookmark: mutationCoordinator.rollback(
              current.bookmark,
              previousBookmark,
              token,
            ),
          });
        }
        setError("Unable to update Bookmark organization");
      } finally {
        markOrganizationPending(key, false);
      }
    },
    [
      markOrganizationPending,
      mutationCoordinator,
      onAuthExpired,
      pendingOrganizationKeys,
      replaceWorkspace,
    ],
  );

  const removeBookmark = useCallback(async () => {
    if (!workspace) return false;
    setError(null);
    setIsDeleting(true);
    try {
      const response = await sendBookmarkMessage({
        type: "bookmark.remove",
        bookmarkId: workspace.bookmark.id,
      });
      if (!response.ok) {
        if (response.authExpired) onAuthExpired();
        else setError(response.error);
        return false;
      }
      if (response.status === "removed") {
        feedDiscoveryGeneration.current += 1;
        setStatus("removed");
        return true;
      }
    } catch {
      setError("Unable to remove the Bookmark");
    } finally {
      setIsDeleting(false);
    }
    return false;
  }, [onAuthExpired, workspace]);

  const createOrganization = useCallback(
    async (kind: "view" | "tag", name: string) => {
      const currentWorkspace = workspaceRef.current;
      if (!currentWorkspace) return;
      const previousBookmark = currentWorkspace.bookmark;
      const token = mutationCoordinator.begin(previousBookmark.id, []);
      setError(null);
      try {
        const response = await sendBookmarkMessage({
          type:
            kind === "view" ? "bookmark.create-view" : "bookmark.create-tag",
          bookmarkId: previousBookmark.id,
          name,
        });
        if (!response.ok) {
          if (response.authExpired) onAuthExpired();
          else setError(response.error);
          throw new Error(response.error);
        }
        if (response.status !== "created-organization") {
          throw new Error("Serial returned an unexpected organization state");
        }
        const current = workspaceRef.current;
        if (current) {
          replaceWorkspace({
            ...current,
            bookmark: mutationCoordinator.reconcile(
              current.bookmark,
              response.bookmark,
              token,
            ),
            views:
              response.kind === "view"
                ? [...current.views, response.option]
                : current.views,
            tags:
              response.kind === "tag"
                ? [...current.tags, response.option]
                : current.tags,
          });
          await toggleOrganization(kind, response.option.id);
        }
      } catch (creationError) {
        const current = workspaceRef.current;
        if (current) {
          replaceWorkspace({
            ...current,
            bookmark: mutationCoordinator.rollback(
              current.bookmark,
              previousBookmark,
              token,
            ),
          });
        }
        const message =
          creationError instanceof Error
            ? creationError.message
            : `Unable to create ${kind}`;
        setError(message);
        throw creationError;
      }
    },
    [mutationCoordinator, onAuthExpired, replaceWorkspace, toggleOrganization],
  );

  const addFeed = useCallback(
    async (url: string) => {
      if (pendingFeedUrls.includes(url)) return;
      setPendingFeedUrls((values) => [...values, url]);
      setError(null);
      try {
        const response = await sendBookmarkMessage({
          type: "bookmark.add-feed",
          url,
        });
        if (!response.ok) {
          if (response.authExpired) onAuthExpired();
          else setError(response.error);
          setPendingFeedUrls((values) =>
            values.filter((value) => value !== url),
          );
          return;
        }
        setPendingFeedUrls((values) => values.filter((value) => value !== url));
        setAddedFeedUrls((values) =>
          values.includes(url) ? values : [...values, url],
        );
      } catch {
        setError("Unable to add the Feed");
        setPendingFeedUrls((values) => values.filter((value) => value !== url));
      }
    },
    [onAuthExpired, pendingFeedUrls],
  );

  return {
    status,
    workspace,
    feedDiscoveryStatus,
    error,
    pendingOrganization,
    pendingFeedUrls,
    addedFeedUrls,
    isDeleting,
    retry: captureActive,
    toggleOrganization,
    createOrganization,
    removeBookmark,
    addFeed,
  };
}
