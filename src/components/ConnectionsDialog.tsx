import { useState } from "react";
import { useDialogStore } from "~/components/feed/dialogStore";
import {
  InstapaperConnectionForm,
  InstapaperConnectionListItem,
} from "./connections/InstapaperConnection";
import { ControlledResponsiveDialog } from "./ui/responsive-dropdown";

type ConnectionView = "list" | "instapaper";

function ConnectionsList({
  onSelectService,
}: {
  onSelectService: (service: ConnectionView) => void;
}) {
  return (
    <div className="grid gap-2">
      <InstapaperConnectionListItem
        onSelect={() => onSelectService("instapaper")}
      />
    </div>
  );
}

export function ConnectionsDialog() {
  const [view, setView] = useState<ConnectionView>("list");

  const dialog = useDialogStore((store) => store.dialog);
  const onDialogOpenChange = useDialogStore((store) => store.onOpenChange);

  const handleOpenChange = (open: boolean) => {
    onDialogOpenChange(open);
    if (!open) {
      setView("list");
    }
  };

  const title = view === "list" ? "Connections" : "Instapaper";
  const description =
    view === "list"
      ? "Manage your connected services"
      : "Connect your Instapaper account";

  return (
    <ControlledResponsiveDialog
      open={dialog === "connections"}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      onBack={view !== "list" ? () => setView("list") : undefined}
    >
      {view === "list" ? (
        <ConnectionsList onSelectService={setView} />
      ) : view === "instapaper" ? (
        <InstapaperConnectionForm onSuccess={() => setView("list")} />
      ) : null}
    </ControlledResponsiveDialog>
  );
}
