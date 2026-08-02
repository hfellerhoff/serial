import type {
  ExtensionCaptureCandidate,
  ExtensionPageObservation,
} from "@serial/bookmark-capture";

import { isSessionExpired } from "./auth";
import type { ExtensionAuthSession } from "./auth";
import { serializeBookmarkRequest } from "./bookmarks";
import type {
  BookmarkMessage,
  BookmarkMessageResponse,
  BookmarkWorkspace,
  ExtensionBookmark,
} from "./bookmarks";

type BookmarkBackgroundDependencies = {
  readStoredSession: () => Promise<ExtensionAuthSession | null>;
  clearSession: (session?: ExtensionAuthSession) => Promise<void>;
  fetchFromInstance: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eligiblePageUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function fallbackCapture(sourceUrl: string): ExtensionCaptureCandidate {
  const url = new URL(sourceUrl);
  const host = url.hostname.replace(/^www\./, "");
  const pathSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  let decodedPathSegment = pathSegment;
  try {
    decodedPathSegment = decodeURIComponent(pathSegment);
  } catch {
    // A malformed escape in the URL should still degrade to URL-only capture.
  }
  const title = decodedPathSegment.replace(/[-_]+/g, " ").trim() || host;
  return {
    effectiveUrl: sourceUrl,
    title,
    siteName: host,
    descriptor: {
      platform: "website",
      contentType: "text",
      orientation: null,
      contentId: null,
      classifierVersion: 1,
    },
  };
}

function parsedObservation(
  value: unknown,
  sourceUrl: string,
): ExtensionPageObservation {
  if (!isRecord(value) || !isRecord(value.capture)) {
    return {
      sourceUrl,
      capture: fallbackCapture(sourceUrl),
      captureFailureReason: "unextractable",
      feeds: [],
    };
  }
  return value as unknown as ExtensionPageObservation;
}

function parseBookmark(value: unknown): ExtensionBookmark | null {
  if (!isRecord(value)) return null;
  const { id, sourceUrl, title, viewIds, tagIds } = value;
  if (
    typeof id !== "string" ||
    typeof sourceUrl !== "string" ||
    typeof title !== "string" ||
    !Array.isArray(viewIds) ||
    !viewIds.every((entry) => typeof entry === "number") ||
    !Array.isArray(tagIds) ||
    !tagIds.every((entry) => typeof entry === "number")
  ) {
    return null;
  }
  const nullableString = (candidate: unknown) =>
    typeof candidate === "string" ? candidate : null;
  return {
    id,
    sourceUrl,
    title,
    author: nullableString(value.author),
    siteName: nullableString(value.siteName),
    thumbnailUrl: nullableString(value.thumbnailUrl),
    iconUrl: nullableString(value.iconUrl),
    captureHash: nullableString(value.captureHash),
    viewIds,
    tagIds,
  };
}

function parseWorkspace(
  value: unknown,
  feeds: ExtensionPageObservation["feeds"],
): BookmarkWorkspace | null {
  if (!isRecord(value) || !isRecord(value.workspace)) return null;
  const bookmark = parseBookmark(value.bookmark);
  const options = (candidate: unknown) =>
    Array.isArray(candidate)
      ? candidate.filter(
          (entry): entry is { id: number; name: string } =>
            isRecord(entry) &&
            typeof entry.id === "number" &&
            typeof entry.name === "string",
        )
      : [];
  const disposition = value.disposition;
  const capture = value.capture;
  if (
    !bookmark ||
    (disposition !== "created" &&
      disposition !== "refreshed" &&
      disposition !== "consolidated") ||
    !isRecord(capture) ||
    (capture.status !== "captured" &&
      capture.status !== "preserved" &&
      capture.status !== "unavailable")
  ) {
    return null;
  }
  return {
    bookmark,
    views: options(value.workspace.views),
    tags: options(value.workspace.tags),
    feeds,
    disposition,
    capture: capture as BookmarkWorkspace["capture"],
  };
}

async function authenticatedApiRequest(
  session: ExtensionAuthSession,
  path: string,
  init: RequestInit,
  dependencies: BookmarkBackgroundDependencies,
) {
  const response = await dependencies.fetchFromInstance(
    `${session.instance}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    },
  );
  if (response.status === 401 || response.status === 403) {
    await dependencies.clearSession(session);
    return { response, payload: null, authExpired: true };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The caller reports a compatibility error without echoing response data.
  }
  return { response, payload, authExpired: false };
}

function apiError(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

async function captureActiveBookmark(
  session: ExtensionAuthSession,
  dependencies: BookmarkBackgroundDependencies,
): Promise<BookmarkMessageResponse> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const sourceUrl = eligiblePageUrl(tab?.url);
  if (!tab?.id || !sourceUrl) return { ok: true, status: "ineligible" };

  let observation: ExtensionPageObservation;
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/content-scripts/bookmark-capture.js"],
    });
    observation = parsedObservation(results[0]?.result, sourceUrl);
  } catch {
    observation = {
      sourceUrl,
      capture: fallbackCapture(sourceUrl),
      captureFailureReason: "unextractable",
      feeds: [],
    };
  }

  const request = await authenticatedApiRequest(
    session,
    "/api/extension/bookmarks",
    {
      method: "POST",
      body: serializeBookmarkRequest(observation).serialized,
    },
    dependencies,
  );
  if (request.authExpired) {
    return { ok: false, authExpired: true, error: "Reconnect to Serial" };
  }
  if (!request.response.ok) {
    return {
      ok: false,
      authExpired: false,
      error: apiError(request.payload, "Serial could not save this Bookmark"),
    };
  }
  const workspace = parseWorkspace(request.payload, observation.feeds);
  if (!workspace) {
    return {
      ok: false,
      authExpired: false,
      error: "This Serial instance returned an incompatible Bookmark response",
    };
  }
  return { ok: true, status: "saved", workspace };
}

export async function handleBookmarkMessage(
  message: BookmarkMessage,
  dependencies: BookmarkBackgroundDependencies,
): Promise<BookmarkMessageResponse> {
  const session = await dependencies.readStoredSession();
  if (!session || isSessionExpired(session)) {
    if (session) await dependencies.clearSession(session);
    return { ok: false, authExpired: true, error: "Reconnect to Serial" };
  }
  try {
    if (message.type === "bookmark.capture-active") {
      return captureActiveBookmark(session, dependencies);
    }
    const request =
      message.type === "bookmark.add-feed"
        ? await authenticatedApiRequest(
            session,
            "/api/extension/feeds",
            {
              method: "POST",
              body: JSON.stringify({ url: message.url }),
            },
            dependencies,
          )
        : await authenticatedApiRequest(
            session,
            "/api/extension/bookmarks",
            {
              method: message.type === "bookmark.remove" ? "DELETE" : "PATCH",
              body: JSON.stringify(
                message.type === "bookmark.remove"
                  ? { bookmarkId: message.bookmarkId }
                  : message.type === "bookmark.set-view"
                    ? {
                        action: "set-view",
                        bookmarkId: message.bookmarkId,
                        viewId: message.viewId,
                        assigned: message.assigned,
                      }
                    : {
                        action: "set-tag",
                        bookmarkId: message.bookmarkId,
                        tagId: message.tagId,
                        assigned: message.assigned,
                      },
              ),
            },
            dependencies,
          );
    if (request.authExpired) {
      return { ok: false, authExpired: true, error: "Reconnect to Serial" };
    }
    if (!request.response.ok) {
      return {
        ok: false,
        authExpired: false,
        error: apiError(
          request.payload,
          "Serial could not complete that action",
        ),
      };
    }
    if (message.type === "bookmark.remove") {
      return { ok: true, status: "removed" };
    }
    if (message.type === "bookmark.add-feed") {
      return { ok: true, status: "feed-added" };
    }
    const bookmark = isRecord(request.payload)
      ? parseBookmark(request.payload.bookmark)
      : null;
    return bookmark
      ? { ok: true, status: "updated", bookmark }
      : {
          ok: false,
          authExpired: false,
          error:
            "This Serial instance returned an incompatible Bookmark response",
        };
  } catch {
    return {
      ok: false,
      authExpired: false,
      error: "Unable to reach the Serial instance",
    };
  }
}
