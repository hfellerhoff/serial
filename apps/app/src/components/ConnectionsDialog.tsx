import { useState } from "react";
import {
  AtprotoConnectionForm,
  AtprotoConnectionListItem,
} from "./connections/AtprotoConnection";
import {
  InstapaperConnectionForm,
  InstapaperConnectionListItem,
} from "./connections/InstapaperConnection";
import { ControlledResponsiveDialog } from "./ui/responsive-dropdown";
import { useDialogStore } from "~/components/feed/dialogStore";

type ConnectionView = "list" | "instapaper" | "atproto";

function ConnectionsList({
  onSelectService,
}: {
  onSelectService: (service: ConnectionView) => void;
}) {
  return (
    <div className="grid gap-2">
      <AtprotoConnectionListItem onSelect={() => onSelectService("atproto")} />
      <InstapaperConnectionListItem
        onSelect={() => onSelectService("instapaper")}
      />
    </div>
  );
}

const VIEW_TITLES: Record<ConnectionView, string> = {
  list: "Connections",
  instapaper: "Instapaper",
  atproto: "Atmosphere",
};

const VIEW_DESCRIPTIONS: Record<ConnectionView, string> = {
  list: "Manage your connected services",
  instapaper: "Connect your Instapaper account",
  atproto: "Connect your Atmosphere account",
};

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

  return (
    <ControlledResponsiveDialog
      open={dialog === "connections"}
      onOpenChange={handleOpenChange}
      title={VIEW_TITLES[view]}
      description={VIEW_DESCRIPTIONS[view]}
      onBack={view !== "list" ? () => setView("list") : undefined}
    >
      {view === "list" && <ConnectionsList onSelectService={setView} />}
      {view === "instapaper" && (
        <InstapaperConnectionForm onSuccess={() => setView("list")} />
      )}
      {view === "atproto" && <AtprotoConnectionForm />}
    </ControlledResponsiveDialog>
  );
}
