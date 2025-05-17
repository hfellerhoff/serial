import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { Button } from "./ui/button";
import { PlusIcon } from "lucide-react";

export function AddContentCategoriesButton() {
  const launchDialog = useDialogStore((store) => store.launchDialog);

  return (
    <Button
      variant="outline"
      onClick={() => {
        launchDialog("add-content-category");
      }}
      className="w-fit"
    >
      <PlusIcon size={16} />
      <span className="pl-1.5">Add a category</span>
    </Button>
  );
}
