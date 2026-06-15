"use client";

import { SubscriptionDialogBody } from "./SubscriptionDialogBody";
import { SubscriptionDialogContext } from "./context";
import { SubscriptionDialogFooter } from "./SubscriptionDialogFooter";
import { useSubscriptionDialogController } from "./useSubscriptionDialogController";
import { getSubscriptionDialogCopy } from "./utils";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";

export function SubscriptionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <SubscriptionDialogContent
      key={open ? "open" : "closed"}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function SubscriptionDialogContent({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useSubscriptionDialogController({ open, onOpenChange });
  const dialogCopy = getSubscriptionDialogCopy(controller);
  const onBack = controller.switchPreview
    ? () => controller.setSwitchPreview(null)
    : controller.isSubscribed
      ? () => controller.setShowPlanPicker(false)
      : undefined;

  return (
    <SubscriptionDialogContext.Provider value={controller.contextValue}>
      <ControlledResponsiveDialog
        open={open}
        onOpenChange={controller.handleOpenChange}
        title={dialogCopy.title}
        description={dialogCopy.description}
        className={
          controller.isPlanPickerView ? "lg:max-w-5xl xl:max-w-6xl" : undefined
        }
        headerClassName={
          controller.isPlanPickerView ? "lg:text-center" : undefined
        }
        onBack={onBack}
        footer={<SubscriptionDialogFooter controller={controller} />}
      >
        <SubscriptionDialogBody controller={controller} />
      </ControlledResponsiveDialog>
    </SubscriptionDialogContext.Provider>
  );
}
