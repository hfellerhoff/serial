"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ViewContentFilterInput,
  ViewLayoutInput,
  ViewTimeInput,
} from "./inputs";
import type { ViewLayout } from "~/server/db/constants";
import type { ContentFilter } from "~/lib/views/contentFilter";
import { Button } from "~/components/ui/button";
import { useCanMutate } from "~/lib/data/offline-mutations";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { useEditViewMutation } from "~/lib/data/views/mutations";
import { useViews } from "~/lib/data/views";
import {
  VIEW_LAYOUT,
  VIEW_READ_STATUS,
  viewLayoutSchema,
} from "~/server/db/constants";
import {
  contentFilterSchema,
  DEFAULT_CONTENT_FILTER,
} from "~/lib/views/contentFilter";

export function BulkEditViewsDialog({
  selectedViewIds,
  open,
  onOpenChange,
}: {
  selectedViewIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canMutate = useCanMutate();
  const [isUpdating, setIsUpdating] = useState(false);
  const { mutateAsync: editView } = useEditViewMutation();
  const { views } = useViews();

  const [daysWindow, setDaysWindow] = useState<number | null>(null);
  const [contentFilter, setContentFilter] = useState<ContentFilter | null>(
    null,
  );
  const [layout, setLayout] = useState<ViewLayout | null>(null);

  // Prefill if all selected views share the same value
  useEffect(() => {
    if (!open || selectedViewIds.length === 0) return;

    const selectedViewIdSet = new Set(selectedViewIds);
    const selected = views.filter((v) => selectedViewIdSet.has(v.id));
    if (selected.length === 0) return;

    const first = selected[0]!;

    const sharedDays = selected.every((v) => v.daysWindow === first.daysWindow)
      ? first.daysWindow
      : null;
    setDaysWindow(sharedDays);

    const firstContentFilter = contentFilterSchema.safeParse(
      first.contentFilter,
    );
    const sharedContentFilter =
      firstContentFilter.success &&
      selected.every((view) => view.contentFilter === first.contentFilter)
        ? firstContentFilter.data
        : null;
    setContentFilter(sharedContentFilter);

    const firstLayout = viewLayoutSchema.safeParse(first.layout);
    const sharedLayout =
      firstLayout.success && selected.every((v) => v.layout === first.layout)
        ? firstLayout.data
        : null;
    setLayout(sharedLayout);
  }, [open, selectedViewIds, views]);

  const handleSave = async () => {
    if (!canMutate || selectedViewIds.length === 0) return;

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
        contentFilter: contentFilter ?? undefined,
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
        <ViewContentFilterInput
          contentFilter={contentFilter ?? DEFAULT_CONTENT_FILTER}
          setContentFilter={(value) => setContentFilter(value)}
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
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={!canMutate || isUpdating}
          >
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </ControlledResponsiveDialog>
  );
}
