import { PlusIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useDialogStore } from "~/components/feed/dialogStore";

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
      <span className="pl-1.5">Add a tag</span>
    </Button>
  );
}
