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
  const [error, setError] = useState<string | null>(null);
  const [pendingOrganization, setPendingOrganization] = useState<string[]>([]);
  const [pendingFeedUrls, setPendingFeedUrls] = useState<string[]>([]);
  const [addedFeedUrls, setAddedFeedUrls] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const attemptedToken = useRef<string | null>(null);
  const workspaceRef = useRef<BookmarkWorkspace | null>(null);
  const pendingOrganizationRef = useRef(new Set<string>());
  const mutationCoordinator = useRef(
    new BookmarkMutationCoordinator<ExtensionBookmark>(),
  ).current;
  const { onAuthExpired, session } = input;

  const replaceWorkspace = useCallback((next: BookmarkWorkspace | null) => {
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);

  const markOrganizationPending = useCallback(
    (key: string, pending: boolean) => {
      if (pending) pendingOrganizationRef.current.add(key);
      else pendingOrganizationRef.current.delete(key);
      setPendingOrganization([...pendingOrganizationRef.current]);
    },
    [],
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

  const captureActive = useCallback(async () => {
    setStatus("loading");
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
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Unable to save this Bookmark",
      );
      setStatus("error");
    }
  }, [handleFailure, replaceWorkspace]);

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
      if (pendingOrganizationRef.current.has(key)) return;
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
