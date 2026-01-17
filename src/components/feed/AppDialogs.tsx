import { AddContentCategoryDialog } from "~/components/AddContentCategoryDialog";
import { AddFeedDialog } from "~/components/AddFeedDialog";
import { AddViewDialog } from "~/components/AddViewDialog";
import { ConnectionsDialog } from "~/components/ConnectionsDialog";
import { CustomVideoDialog } from "~/components/CustomVideoDialog";
import { UserProfileEditDialog } from "./UserProfileEditDialog";

export function AppDialogs() {
  return (
    <>
      <AddFeedDialog />
      <AddViewDialog />
      <AddContentCategoryDialog />
      <CustomVideoDialog />
      <UserProfileEditDialog />
      <ConnectionsDialog />
    </>
  );
}
