import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtensionAuthSession } from "../../lib/auth";
import type {
  BookmarkMessage,
  BookmarkMessageResponse,
  BookmarkWorkspace,
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
  const [isDeleting, setIsDeleting] = useState(false);
  const attemptedToken = useRef<string | null>(null);
  const { onAuthExpired, session } = input;

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
        setWorkspace(null);
        setStatus(response.status);
        return;
      }
      if (response.status !== "saved") {
        throw new Error("Serial returned an unexpected Bookmark state");
      }
      setWorkspace(response.workspace);
      setStatus("saved");
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Unable to save this Bookmark",
      );
      setStatus("error");
    }
  }, [handleFailure]);

  useEffect(() => {
    if (attemptedToken.current === session.token) return;
    attemptedToken.current = session.token;
    void captureActive();
  }, [captureActive, session.token]);

  const toggleOrganization = useCallback(
    async (kind: "view" | "tag", id: number) => {
      if (!workspace) return;
      const key = `${kind}:${id}`;
      if (pendingOrganization.includes(key)) return;
      const idField = kind === "view" ? "viewIds" : "tagIds";
      const assigned = !workspace.bookmark[idField].includes(id);
      const previousBookmark = workspace.bookmark;
      setWorkspace({
        ...workspace,
        bookmark: {
          ...workspace.bookmark,
          [idField]: assigned
            ? [...workspace.bookmark[idField], id]
            : workspace.bookmark[idField].filter((value) => value !== id),
        },
      });
      setPendingOrganization((values) => [...values, key]);
      setError(null);
      try {
        const response = await sendBookmarkMessage(
          kind === "view"
            ? {
                type: "bookmark.set-view",
                bookmarkId: workspace.bookmark.id,
                viewId: id,
                assigned,
              }
            : {
                type: "bookmark.set-tag",
                bookmarkId: workspace.bookmark.id,
                tagId: id,
                assigned,
              },
        );
        if (!response.ok) {
          setWorkspace((current) =>
            current ? { ...current, bookmark: previousBookmark } : current,
          );
          if (response.authExpired) onAuthExpired();
          else setError(response.error);
          return;
        }
        if (response.status === "updated") {
          setWorkspace((current) =>
            current ? { ...current, bookmark: response.bookmark } : current,
          );
        }
      } catch {
        setWorkspace((current) =>
          current ? { ...current, bookmark: previousBookmark } : current,
        );
        setError("Unable to update Bookmark organization");
      } finally {
        setPendingOrganization((values) =>
          values.filter((value) => value !== key),
        );
      }
    },
    [onAuthExpired, pendingOrganization, workspace],
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
      if (!workspace) return;
      setError(null);
      try {
        const response = await sendBookmarkMessage({
          type:
            kind === "view" ? "bookmark.create-view" : "bookmark.create-tag",
          bookmarkId: workspace.bookmark.id,
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
        setWorkspace((current) => {
          if (!current) return current;
          return {
            ...current,
            bookmark: response.bookmark,
            views:
              response.kind === "view"
                ? [...current.views, response.option]
                : current.views,
            tags:
              response.kind === "tag"
                ? [...current.tags, response.option]
                : current.tags,
          };
        });
      } catch (creationError) {
        const message =
          creationError instanceof Error
            ? creationError.message
            : `Unable to create ${kind}`;
        setError(message);
        throw creationError;
      }
    },
    [onAuthExpired, workspace],
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
    addedFeedUrls: pendingFeedUrls,
    isDeleting,
    retry: captureActive,
    toggleOrganization,
    createOrganization,
    removeBookmark,
    addFeed,
  };
}
