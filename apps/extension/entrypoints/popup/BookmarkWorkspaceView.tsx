import {
  Alert,
  AlertDescription,
  Button,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Label,
} from "@serial/ui";
import {
  Bookmark,
  Check,
  Info,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
} from "lucide-react";
import type { ExtensionAuthSession } from "../../lib/auth";
import type {
  BookmarkWorkspace,
  OrganizationOption,
} from "../../lib/bookmarks";
import { ExtensionHeader } from "./ExtensionHeader";
import { PopupLayout } from "./PopupLayout";
import { useBookmarkWorkspace } from "./useBookmarkWorkspace";

const CAPTURE_FAILURE_MESSAGES: Record<
  Exclude<BookmarkWorkspace["capture"], { status: "captured" }>["reason"],
  string
> = {
  blocked_target: "This address cannot be captured safely.",
  timeout: "The page took too long to capture.",
  http_error: "The page did not return usable content.",
  not_html: "The address did not return a web page.",
  too_large: "The page was too large to capture.",
  unextractable: "Serial could not prepare a reader copy.",
  invalid_capture: "The extracted page did not pass Serial’s safety checks.",
  unsupported_capture_version: "This capture format is not supported.",
  rate_limited: "Capture is temporarily rate limited.",
  capacity_limited: "Capture capacity is temporarily unavailable.",
  unsupported_content: "This content opens on its original site.",
};

function OrganizationChoices({
  label,
  options,
  selectedIds,
  pendingKeys,
  kind,
  onToggle,
}: {
  label: string;
  options: OrganizationOption[];
  selectedIds: number[];
  pendingKeys: string[];
  kind: "view" | "tag";
  onToggle: (id: number) => void;
}) {
  const selectedIdSet = new Set(selectedIds);
  const pendingKeySet = new Set(pendingKeys);
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {options.length === 0 ? (
        <p className="text-muted-foreground text-xs">No {label} yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = selectedIdSet.has(option.id);
            return (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={selected ? "secondary" : "outline"}
                aria-pressed={selected}
                disabled={pendingKeySet.has(`${kind}:${option.id}`)}
                onClick={() => onToggle(option.id)}
              >
                {selected && <Check className="size-3.5" />}
                {option.name}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CaptureFeedback({ workspace }: { workspace: BookmarkWorkspace }) {
  if (workspace.capture.status === "captured") {
    if (workspace.disposition === "created") return null;
    return (
      <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
        <RefreshCw className="size-3.5" /> Existing capture refreshed
      </p>
    );
  }
  const preserved = workspace.capture.status === "preserved";
  return (
    <p className="text-muted-foreground mt-3 text-xs" role="status">
      {CAPTURE_FAILURE_MESSAGES[workspace.capture.reason]}{" "}
      {preserved
        ? "The previous Page capture is still available."
        : "This Bookmark will open the original page."}
    </p>
  );
}

function WorkspaceContent({
  workspace,
  pendingOrganization,
  addedFeedUrls,
  onToggle,
  onAddFeed,
}: {
  workspace: BookmarkWorkspace;
  pendingOrganization: string[];
  addedFeedUrls: string[];
  onToggle: (kind: "view" | "tag", id: number) => void;
  onAddFeed: (url: string) => void;
}) {
  const addedFeedUrlSet = new Set(addedFeedUrls);
  const source =
    workspace.bookmark.author ||
    workspace.bookmark.siteName ||
    new URL(workspace.bookmark.sourceUrl).hostname;
  return (
    <div className="grid gap-5 pb-5">
      <div>
        <Item size="sm" variant="muted" className="flex-nowrap">
          <ItemMedia variant="icon">
            <Bookmark className="size-4" />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle>{workspace.bookmark.title}</ItemTitle>
            <ItemDescription className="truncate">{source}</ItemDescription>
          </ItemContent>
        </Item>
        <CaptureFeedback workspace={workspace} />
      </div>

      <div className="grid gap-5 border-t pt-5">
        <OrganizationChoices
          label="Views"
          kind="view"
          options={workspace.views}
          selectedIds={workspace.bookmark.viewIds}
          pendingKeys={pendingOrganization}
          onToggle={(id) => onToggle("view", id)}
        />
        <OrganizationChoices
          label="Tags"
          kind="tag"
          options={workspace.tags}
          selectedIds={workspace.bookmark.tagIds}
          pendingKeys={pendingOrganization}
          onToggle={(id) => onToggle("tag", id)}
        />
      </div>

      {workspace.feeds.length > 0 && (
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
                  <ItemTitle>
                    {feed.title || new URL(feed.url).hostname}
                  </ItemTitle>
                  <ItemDescription className="truncate">
                    {feed.url}
                  </ItemDescription>
                </ItemContent>
                <Button
                  type="button"
                  size="icon md:default"
                  variant="outline"
                  disabled={added}
                  aria-label={
                    added ? "Feed added" : `Add ${feed.title || "Feed"}`
                  }
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
      )}
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
      size={controller.status === "saved" ? "icon" : "icon md:default"}
      className={controller.status === "saved" ? undefined : "w-full"}
      disabled={signingOut}
      aria-label="Sign out of extension"
      onClick={onSignOut}
    >
      {signingOut ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      {controller.status !== "saved" && (
        <span className="pl-1.5 md:pl-0">Sign out of extension</span>
      )}
    </Button>
  );
  const footer =
    controller.status === "saved" && controller.workspace ? (
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon md:default"
          className="text-destructive flex-1"
          onClick={() => void controller.removeBookmark()}
        >
          <Trash2 className="size-4" />
          <span className="pl-1.5 md:pl-0">Remove Bookmark</span>
        </Button>
        {signOutButton}
      </div>
    ) : (
      signOutButton
    );

  return (
    <PopupLayout footer={footer}>
      <ExtensionHeader
        title="Serial"
        description={new URL(session.instance).host}
      />

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

      {controller.status === "removed" && (
        <div className="mt-8">
          <p className="text-sm font-medium">Bookmark removed</p>
          <p className="text-muted-foreground mt-1 text-sm">
            The Bookmark and its Page capture were deleted.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => void controller.retry()}
          >
            <Bookmark className="size-4" /> Save again
          </Button>
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

      {controller.status === "saved" && controller.workspace && (
        <div className="mt-5">
          <WorkspaceContent
            workspace={controller.workspace}
            pendingOrganization={controller.pendingOrganization}
            addedFeedUrls={controller.addedFeedUrls}
            onToggle={(kind, id) =>
              void controller.toggleOrganization(kind, id)
            }
            onAddFeed={(url) => void controller.addFeed(url)}
          />
        </div>
      )}
    </PopupLayout>
  );
}
