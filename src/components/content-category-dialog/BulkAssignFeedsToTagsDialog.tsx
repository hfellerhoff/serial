"use client";

import { BulkAssignFeedsToTagsContent } from "./BulkAssignFeedsToTagsContent";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";

export function BulkAssignFeedsToTagsDialog({
  selectedTagIds,
  open,
  onOpenChange,
}: {
  selectedTagIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign Feeds"
      description={`Assign feeds to ${selectedTagIds.length} tag${selectedTagIds.length > 1 ? "s" : ""}.`}
    >
      {open && (
        <BulkAssignFeedsToTagsContent
          selectedTagIds={selectedTagIds}
          onClose={() => onOpenChange(false)}
        />
      )}
    </ControlledResponsiveDialog>
  );
}
