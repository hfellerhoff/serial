"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BookmarkCheckIcon,
  BookmarkIcon,
} from "lucide-react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { useUpdateBookmarkStateMutation } from "~/lib/data/bookmarks/mutations";
import { useShortcut } from "~/lib/hooks/useShortcut";

export function BookmarkReaderActions({ bookmarkId }: { bookmarkId: string }) {
  const bookmark = useBookmarkValue(bookmarkId);
  const { mutate: updateState } = useUpdateBookmarkStateMutation(bookmarkId);

  const toggleSaved = () => {
    if (!bookmark) return;
    updateState({ bookmarkId, isSaved: !bookmark.isSaved });
  };
  const toggleRead = () => {
    if (!bookmark) return;
    updateState({ bookmarkId, isRead: !bookmark.isRead });
  };

  useShortcut(SHORTCUT_KEYS.TOGGLE_SAVED, toggleSaved);
  useShortcut(SHORTCUT_KEYS.TOGGLE_READ, toggleRead);

  if (!bookmark) return null;

  return (
    <div className="flex w-full items-center justify-center gap-2 p-6">
      <ButtonWithShortcut
        shortcut={SHORTCUT_KEYS.TOGGLE_SAVED}
        variant={bookmark.isSaved ? "secondary" : "outline"}
        aria-label={bookmark.isSaved ? "Unsave" : "Save"}
        onClick={toggleSaved}
        size="icon md:default"
      >
        {bookmark.isSaved ? (
          <BookmarkCheckIcon size={16} />
        ) : (
          <BookmarkIcon size={16} />
        )}
        <span className="hidden pl-1.5 md:block">
          {bookmark.isSaved ? "Unsave" : "Save"}
        </span>
      </ButtonWithShortcut>
      <ButtonWithShortcut
        shortcut={SHORTCUT_KEYS.TOGGLE_READ}
        variant={bookmark.isRead ? "secondary" : "outline"}
        aria-label={bookmark.isRead ? "Unarchive" : "Archive"}
        onClick={toggleRead}
        size="icon md:default"
      >
        {bookmark.isRead ? (
          <ArchiveRestoreIcon size={16} />
        ) : (
          <ArchiveIcon size={16} />
        )}
        <span className="hidden pl-1.5 md:block">
          {bookmark.isRead ? "Unarchive" : "Archive"}
        </span>
      </ButtonWithShortcut>
    </div>
  );
}
