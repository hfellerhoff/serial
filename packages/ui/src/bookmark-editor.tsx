"use client";

import { BookmarkCheckIcon, RefreshCwIcon } from "lucide-react";
import type { BookmarkContentDescriptor } from "@serial/bookmark-capture";
import type { ReactNode } from "react";

import {
  BOOKMARK_ORIGIN_FALLBACK_MESSAGE,
  shouldShowBookmarkEditorFeedback,
} from "./bookmark-editor.utils";
import { Button } from "./button";
import { cn } from "./lib/cn";
import {
  SelectableChipList,
  type SelectableChipOption,
} from "./selectable-chip-list";

export type BookmarkEditorCaptureOutcome =
  | { status: "captured" }
  | {
      status: "preserved" | "unavailable";
      reason:
        | "blocked_target"
        | "timeout"
        | "http_error"
        | "not_html"
        | "too_large"
        | "unextractable"
        | "invalid_capture"
        | "unsupported_capture_version"
        | "rate_limited"
        | "capacity_limited"
        | "unsupported_content";
    };

export type BookmarkEditorFeedback = {
  capture: BookmarkEditorCaptureOutcome;
  disposition: "created" | "refreshed" | "consolidated";
};

const CAPTURE_FAILURE_MESSAGES: Record<
  Exclude<BookmarkEditorCaptureOutcome, { status: "captured" }>["reason"],
  string
> = {
  blocked_target: "This address cannot be captured safely.",
  timeout: "The page took too long to capture.",
  http_error: "The page did not return usable content.",
  not_html: "The address did not return a web page.",
  too_large: "The page was too large to capture.",
  unextractable: "Serial could not extract reader-oriented content.",
  invalid_capture: "The extracted page did not pass Serial’s safety checks.",
  unsupported_capture_version: "This capture format is not supported.",
  rate_limited: "Capture is temporarily rate limited.",
  capacity_limited: "Capture capacity is temporarily unavailable.",
  unsupported_content: BOOKMARK_ORIGIN_FALLBACK_MESSAGE,
};

function CaptureFeedback({ feedback }: { feedback: BookmarkEditorFeedback }) {
  if (feedback.capture.status === "captured") {
    if (feedback.disposition === "created") return null;
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <RefreshCwIcon className="size-4" />
        Existing Bookmark refreshed. Its Views and Tags were preserved.
      </p>
    );
  }

  const preserved = feedback.capture.status === "preserved";
  if (feedback.capture.reason === "unsupported_content") {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        {CAPTURE_FAILURE_MESSAGES.unsupported_content}
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-sm" role="status">
      {CAPTURE_FAILURE_MESSAGES[feedback.capture.reason]}{" "}
      {preserved
        ? "The previous Page capture is still available."
        : "This Bookmark will open the original page."}
    </p>
  );
}

export function BookmarkEditor({
  bookmark,
  feedback,
  viewOptions,
  selectedViewIds,
  onToggleView,
  onCreateView,
  tagOptions,
  selectedTagIds,
  prioritizedTagIds,
  onToggleTag,
  onCreateTag,
  afterOrganization,
  className,
  isDeleting,
  onDelete,
  onDone,
}: {
  bookmark: {
    title: string;
    author: string | null;
    sourceUrl: string;
  } & BookmarkContentDescriptor;
  feedback?: BookmarkEditorFeedback;
  viewOptions: SelectableChipOption[];
  selectedViewIds: number[];
  onToggleView: (id: number) => void;
  onCreateView: (name: string) => void | Promise<void>;
  tagOptions: SelectableChipOption[];
  selectedTagIds: number[];
  prioritizedTagIds?: ReadonlySet<number>;
  onToggleTag: (id: number) => void;
  onCreateTag: (name: string) => void | Promise<void>;
  afterOrganization?: ReactNode;
  className?: string;
  isDeleting: boolean;
  onDelete: () => void | Promise<void>;
  onDone: () => void;
}) {
  const showFeedback = shouldShowBookmarkEditorFeedback(feedback, bookmark);

  return (
    <div
      className={cn(
        "flex max-h-[min(100dvh,44rem)] min-h-0 flex-col",
        className,
      )}
    >
      <div className="shrink-0 border-b px-6 py-5 pr-12">
        <div className="flex items-start gap-3">
          <div className="bg-muted text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded">
            <BookmarkCheckIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="line-clamp-2 font-semibold">{bookmark.title}</h2>
            <p className="text-muted-foreground truncate text-sm">
              {bookmark.author || new URL(bookmark.sourceUrl).hostname}
            </p>
          </div>
        </div>
        {feedback && showFeedback && (
          <div className="mt-4" data-testid="bookmark-capture-feedback">
            <CaptureFeedback feedback={feedback} />
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 py-5">
        <SelectableChipList
          label="Views"
          options={viewOptions}
          selectedIds={selectedViewIds}
          onToggle={onToggleView}
          onCreate={onCreateView}
          createLabel="Create view"
          createPlaceholder="New view name..."
        />
        <SelectableChipList
          label="Tags"
          options={tagOptions}
          selectedIds={selectedTagIds}
          prioritizedIds={prioritizedTagIds}
          onToggle={onToggleTag}
          onCreate={onCreateTag}
          createLabel="Create tag"
          createPlaceholder="New tag name..."
        />
        {afterOrganization}
      </div>

      <div className="flex shrink-0 gap-2 border-t px-6 py-4">
        <Button
          variant="destructive"
          className="flex-1"
          disabled={isDeleting}
          aria-label="Delete Bookmark"
          onClick={() => void onDelete()}
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
        <Button className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
