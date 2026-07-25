import { useDialogStore } from "./dialogStore";
import { SubscriptionDialog } from "./subscription-dialog/SubscriptionDialog";
import { UserProfileEditDialog } from "./UserProfileEditDialog";
import { AddContentCategoryDialog } from "~/components/AddContentCategoryDialog";
import { AddFeedDialog, EditFeedDialog } from "~/components/AddFeedDialog";
import { AddViewDialog } from "~/components/view-dialog";
import { ConnectionsDialog } from "~/components/ConnectionsDialog";
import { CustomVideoDialog } from "~/components/CustomVideoDialog";

export function AppDialogs() {
  const { dialog, closeDialog, selectedFeedId } = useDialogStore();

  return (
    <>
      <AddFeedDialog />
      <EditFeedDialog
        selectedFeedId={dialog === "edit-feed" ? selectedFeedId : null}
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
