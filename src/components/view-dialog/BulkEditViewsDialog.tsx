"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ViewContentTypeInput, ViewLayoutInput, ViewTimeInput } from "./inputs";
import type { ViewContentType, ViewLayout } from "~/server/db/constants";
import { Button } from "~/components/ui/button";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { useEditViewMutation } from "~/lib/data/views/mutations";
import { useViews } from "~/lib/data/views";
import {
  VIEW_CONTENT_TYPE,
  VIEW_LAYOUT,
  VIEW_READ_STATUS,
  viewContentTypeSchema,
  viewLayoutSchema,
} from "~/server/db/constants";

export function BulkEditViewsDialog({
  selectedViewIds,
  open,
  onOpenChange,
}: {
  selectedViewIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { mutateAsync: editView } = useEditViewMutation();
  const { views } = useViews();

  const [daysWindow, setDaysWindow] = useState<number | null>(null);
  const [contentType, setContentType] = useState<ViewContentType | null>(null);
  const [layout, setLayout] = useState<ViewLayout | null>(null);

  // Prefill if all selected views share the same value
  useEffect(() => {
    if (!open || selectedViewIds.length === 0) return;

    const selected = views.filter((v) => selectedViewIds.includes(v.id));
    if (selected.length === 0) return;

    const first = selected[0]!;

    const sharedDays = selected.every((v) => v.daysWindow === first.daysWindow)
      ? first.daysWindow
      : null;
    setDaysWindow(sharedDays);

    const firstContentType = viewContentTypeSchema.safeParse(first.contentType);
    const sharedContentType =
      firstContentType.success &&
      selected.every((v) => v.contentType === first.contentType)
        ? firstContentType.data
        : null;
    setContentType(sharedContentType);

    const firstLayout = viewLayoutSchema.safeParse(first.layout);
    const sharedLayout =
      firstLayout.success && selected.every((v) => v.layout === first.layout)
        ? firstLayout.data
        : null;
    setLayout(sharedLayout);
  }, [open, selectedViewIds, views]);

  const handleSave = async () => {
    if (selectedViewIds.length === 0) return;

    setIsUpdating(true);
    const count = selectedViewIds.length;

    const promises = selectedViewIds.map((id) => {
      const view = views.find((v) => v.id === id);
      if (!view) return Promise.resolve();

      return editView({
        id,
        name: view.name,
        daysWindow: daysWindow ?? view.daysWindow,
        readStatus: VIEW_READ_STATUS.UNREAD,
        contentType: contentType ?? undefined,
        layout: layout ?? undefined,
        categoryIds: view.categoryIds,
        feedIds: view.feedIds,
      });
    });

    toast.promise(Promise.all(promises), {
      loading: `Updating ${count} view${count > 1 ? "s" : ""}...`,
      success: `Updated ${count} view${count > 1 ? "s" : ""}!`,
      error: "Failed to update views",
    });

    onOpenChange(false);
    setIsUpdating(false);
  };

  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Views"
      description={`Edit ${selectedViewIds.length} view${selectedViewIds.length > 1 ? "s" : ""}.`}
    >
      <div className="grid gap-6">
        <ViewTimeInput
          daysWindow={daysWindow ?? 0}
          setDaysWindow={(value) => setDaysWindow(value)}
        />
        <ViewContentTypeInput
          contentType={contentType ?? VIEW_CONTENT_TYPE.LONGFORM}
          setContentType={(value) => setContentType(value)}
        />
        <ViewLayoutInput
          layout={layout ?? VIEW_LAYOUT.LIST}
          setLayout={(value) => setLayout(value)}
          label="Base Layout"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </ControlledResponsiveDialog>
  );
}
