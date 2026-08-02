import {
  Alert,
  AlertDescription,
  BookmarkEditor,
  Button,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@serial/ui";
import { Check, Info, Loader2, LogOut, Plus, Rss } from "lucide-react";

import type { ExtensionAuthSession } from "../../lib/auth";
import type { BookmarkWorkspace } from "../../lib/bookmarks";
import { ExtensionHeader } from "./ExtensionHeader";
import { PopupLayout } from "./PopupLayout";
import { useBookmarkWorkspace } from "./useBookmarkWorkspace";

function FeedDiscovery({
  workspace,
  addedFeedUrls,
  onAddFeed,
}: {
  workspace: BookmarkWorkspace;
  addedFeedUrls: string[];
  onAddFeed: (url: string) => void;
}) {
  if (workspace.feeds.length === 0) return null;
  const addedFeedUrlSet = new Set(addedFeedUrls);
  return (
    <div className="grid gap-2 border-t pt-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Feeds on this page</h2>
        <Rss className="text-muted-foreground size-4" />
      </div>
      {workspace.feeds.map((feed) => {
        const added = addedFeedUrlSet.has(feed.url);
        return (
          <Item
            key={feed.url}
            size="xs"
            variant="outline"
            className="flex-nowrap"
          >
            <ItemMedia variant="icon">
              <Rss className="size-4" />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{feed.title || new URL(feed.url).hostname}</ItemTitle>
              <ItemDescription className="truncate">{feed.url}</ItemDescription>
            </ItemContent>
            <Button
              type="button"
              size="icon md:default"
              variant="outline"
              disabled={added}
              aria-label={added ? "Feed added" : `Add ${feed.title || "Feed"}`}
              onClick={() => onAddFeed(feed.url)}
            >
              {added ? (
                <Check className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              <span className="hidden pl-1.5 md:block">
                {added ? "Added" : "Add"}
              </span>
            </Button>
          </Item>
        );
      })}
    </div>
  );
}

export function BookmarkWorkspaceView({
  session,
  signingOut,
  externalError,
  onSignOut,
  onAuthExpired,
}: {
  session: ExtensionAuthSession;
  signingOut: boolean;
  externalError: string | null;
  onSignOut: () => void;
  onAuthExpired: () => void;
}) {
  const controller = useBookmarkWorkspace({ session, onAuthExpired });
  const signOutButton = (
    <Button
      type="button"
      variant="outline"
      size="icon md:default"
      className="w-full"
      disabled={signingOut}
      aria-label="Sign out of extension"
      onClick={onSignOut}
    >
      {signingOut ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      <span className="pl-1.5 md:pl-0">Sign out of extension</span>
    </Button>
  );

  if (controller.status === "saved" && controller.workspace) {
    const { workspace } = controller;
    const selectedViewIdSet = new Set(workspace.bookmark.viewIds);
    const prioritizedTagIds = new Set<number>();
    for (const view of workspace.views) {
      if (!selectedViewIdSet.has(view.id)) continue;
      for (const tagId of view.tagIds) prioritizedTagIds.add(tagId);
    }
    const error = externalError || controller.error;
    return (
      <BookmarkEditor
        bookmark={workspace.bookmark}
        feedback={workspace}
        viewOptions={workspace.views.map((view) => ({
          id: view.id,
          label: view.name,
        }))}
        selectedViewIds={workspace.bookmark.viewIds}
        onToggleView={(id) => void controller.toggleOrganization("view", id)}
        onCreateView={(name) => controller.createOrganization("view", name)}
        tagOptions={workspace.tags.map((tag) => ({
          id: tag.id,
          label: tag.name,
        }))}
        selectedTagIds={workspace.bookmark.tagIds}
        prioritizedTagIds={prioritizedTagIds}
        onToggleTag={(id) => void controller.toggleOrganization("tag", id)}
        onCreateTag={(name) => controller.createOrganization("tag", name)}
        afterOrganization={
          <>
            {error && (
              <Alert variant="destructive">
                <Info />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FeedDiscovery
              workspace={workspace}
              addedFeedUrls={controller.addedFeedUrls}
              onAddFeed={(url) => void controller.addFeed(url)}
            />
          </>
        }
        isDeleting={controller.isDeleting}
        onDelete={async () => {
          if (await controller.removeBookmark()) window.close();
        }}
        onDone={() => window.close()}
      />
    );
  }

  return (
    <PopupLayout footer={signOutButton}>
      <ExtensionHeader
        title="Serial"
        description={new URL(session.instance).host}
      />

      {controller.status === "base" && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Check className="size-4" />
            Signed in
          </div>
        </div>
      )}

      {controller.status === "loading" && (
        <div
          className="text-muted-foreground mt-8 flex items-center gap-2 text-sm"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" /> Preparing Bookmark…
        </div>
      )}

      {controller.status === "ineligible" && (
        <div className="mt-8">
          <p className="text-sm font-medium">This page can’t be bookmarked.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Open an HTTP(S) page and try again.
          </p>
        </div>
      )}

      {(externalError || controller.error) && (
        <Alert variant="destructive" className="mt-5">
          <Info />
          <AlertDescription>
            {externalError || controller.error}
          </AlertDescription>
        </Alert>
      )}

      {controller.status === "error" && (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => void controller.retry()}
        >
          Retry
        </Button>
      )}
    </PopupLayout>
  );
}
