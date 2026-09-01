import { useEffect } from "react";
import { useDialogStore } from "./dialogStore";
import { SubscriptionDialog } from "./subscription-dialog/SubscriptionDialog";
import { UserProfileEditDialog } from "./UserProfileEditDialog";
import { AddContentCategoryDialog } from "~/components/AddContentCategoryDialog";
import { AddFeedDialog, EditFeedDialog } from "~/components/AddFeedDialog";
import { AddViewDialog } from "~/components/view-dialog";
import { ConnectionsDialog } from "~/components/ConnectionsDialog";
import { CustomVideoDialog } from "~/components/CustomVideoDialog";
import { EditBookmarkDialog } from "~/components/bookmarks/BookmarkOrganizationEditor";
import { useCanMutate } from "~/lib/data/offline-mutations";

export function AppDialogs() {
  const canMutate = useCanMutate();
  const { dialog, closeDialog, selectedFeedId, selectedBookmarkId } =
    useDialogStore();

  useEffect(() => {
    if (!canMutate && dialog) closeDialog();
  }, [canMutate, closeDialog, dialog]);

  return (
    <>
      <AddFeedDialog />
      <EditFeedDialog
        selectedFeedId={dialog === "edit-feed" ? selectedFeedId : null}
        onClose={closeDialog}
      />
      <EditBookmarkDialog
        bookmarkId={dialog === "edit-bookmark" ? selectedBookmarkId : null}
        onClose={closeDialog}
      />
      <AddViewDialog />
      <AddContentCategoryDialog />
      <CustomVideoDialog />
      <UserProfileEditDialog />
      <ConnectionsDialog />
      <SubscriptionDialog
        open={dialog === "subscription"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      />
    </>
  );
}
