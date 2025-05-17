import { AddContentCategoryDialog } from "~/components/AddContentCategoryDialog";
import { AddFeedDialog } from "~/components/AddFeedDialog";
import { AddViewDialog } from "~/components/AddViewDialog";
import { CustomVideoDialog } from "~/components/CustomVideoDialog";

export function AppDialogs() {
  return (
    <>
      <AddFeedDialog />
      <AddViewDialog />
      <AddContentCategoryDialog />
      <CustomVideoDialog />
    </>
  );
}
