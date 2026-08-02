"use client";

import {
  BookmarkCheckIcon,
  ExternalLinkIcon,
  InfoIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { BookmarkContentDescriptor } from "@serial/bookmark-capture";
import type { ReactNode } from "react";

import {
  getBookmarkEditorFeedbackPresentation,
  shouldShowBookmarkEditorFeedback,
} from "./bookmark-editor.utils";
import { Button } from "./button";
import { cn } from "./lib/cn";
import {
  SelectableChipList,
  type SelectableChipOption,
} from "./selectable-chip-list";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

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
  headerClassName,
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
  headerClassName?: string;
  isDeleting: boolean;
  onDelete: () => void | Promise<void>;
  onDone: () => void;
}) {
  const showFeedback = shouldShowBookmarkEditorFeedback(feedback, bookmark);
  const feedbackPresentation =
    feedback && showFeedback
      ? getBookmarkEditorFeedbackPresentation(feedback)
      : null;
  const FeedbackIcon =
    feedbackPresentation?.icon === "refresh"
      ? RefreshCwIcon
      : feedbackPresentation?.icon === "origin"
        ? ExternalLinkIcon
        : InfoIcon;

  return (
    <div
      className={cn(
        "flex max-h-[min(100dvh,44rem)] min-h-0 flex-col overflow-y-auto",
        className,
      )}
    >
      <div
        className={cn(
          "bg-background sticky top-0 z-10 shrink-0 border-b px-6 py-5",
          headerClassName,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="bg-muted text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded">
            <BookmarkCheckIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 font-semibold">{bookmark.title}</h2>
            <p className="text-muted-foreground truncate text-sm">
              {bookmark.author || new URL(bookmark.sourceUrl).hostname}
            </p>
          </div>
          {feedbackPresentation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:bg-muted focus-visible:ring-ring mt-0.5 flex size-9 shrink-0 items-center justify-center rounded outline-none focus-visible:ring-2"
                  aria-label={feedbackPresentation.message}
                  data-testid="bookmark-capture-feedback"
                >
                  <FeedbackIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end" className="max-w-80">
                {feedbackPresentation.message}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="grid flex-1 content-start gap-6 px-6 py-5">
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

      <div className="bg-background sticky bottom-0 z-10 flex shrink-0 gap-2 border-t px-6 py-4">
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
