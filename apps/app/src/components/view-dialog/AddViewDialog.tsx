"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ContentTab } from "./ContentTab";
import { DisplayTab } from "./DisplayTab";
import type { ViewLayout } from "~/server/db/constants";
import type { ContentFilter } from "~/lib/views/contentFilter";
import type { ViewSection } from "./ViewSectionList";
import { Button } from "~/components/ui/button";
import { useCanMutate } from "~/lib/data/offline-mutations";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useDialogStore } from "~/components/feed/dialogStore";
import { useCreateViewMutation } from "~/lib/data/views/mutations";
import { DEFAULT_VIEW_LAYOUT, VIEW_READ_STATUS } from "~/server/db/constants";
import { DEFAULT_CONTENT_FILTER } from "~/lib/views/contentFilter";

export function AddViewDialog() {
  const canMutate = useCanMutate();
  const [isAddingView, setIsAddingView] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: createView } = useCreateViewMutation();

  const [name, setName] = useState<string>("");
  const [daysTimeWindow, setDaysTimeWindow] = useState<number>(0);
  const [contentFilter, setContentFilter] = useState<ContentFilter>(
    DEFAULT_CONTENT_FILTER,
  );
  const [layout, setLayout] = useState<ViewLayout>(DEFAULT_VIEW_LAYOUT);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedFeedIds, setSelectedFeedIds] = useState<number[]>([]);
  const [viewSections, setViewSections] = useState<ViewSection[]>([]);

  const dialog = useDialogStore((store) => store.dialog);
  const onOpenChangeDialog = useDialogStore((store) => store.onOpenChange);

  const isDisabled = !name;

  const onOpenChange = (value: boolean) => {
    onOpenChangeDialog(value);

    if (!value) {
      setName("");
      setDaysTimeWindow(0);
      setContentFilter(DEFAULT_CONTENT_FILTER);
      setLayout(DEFAULT_VIEW_LAYOUT);
      setSelectedCategories([]);
      setSelectedFeedIds([]);
      setViewSections([]);
    }
  };

  const handleSave = async () => {
    if (!canMutate) return;
    setIsAddingView(true);

    try {
      const addViewPromise = createView({
        name,
        daysWindow: daysTimeWindow,
        readStatus: VIEW_READ_STATUS.UNREAD,
        contentFilter,
        layout: layout,
        categoryIds: selectedCategories,
        feedIds: selectedFeedIds,
        viewSections: viewSections.map((item, index) => ({
          placement: index,
          itemType: item.itemType,
          itemId: item.itemId,
          layout: item.layout,
        })),
      });
      toast.promise(addViewPromise, {
        loading: "Adding view...",
        success: () => {
          return "View added!";
        },
        error: () => {
          return "Something went wrong adding your view.";
        },
      });
      onOpenChange(false);
    } catch {
      // Error handled by toast.promise
    }

    setIsAddingView(false);
  };

  return (
    <ControlledResponsiveDialog
      open={dialog === "add-view"}
      onOpenChange={onOpenChange}
      title="Add View"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        nameInputRef.current?.focus();
      }}
    >
      <Tabs defaultValue="content" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
        </TabsList>
        <TabsContent value="content" className="mt-4">
          <ContentTab
            name={name}
            setName={setName}
            nameInputRef={nameInputRef}
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
            selectedFeedIds={selectedFeedIds}
            setSelectedFeedIds={setSelectedFeedIds}
            daysTimeWindow={daysTimeWindow}
            setDaysTimeWindow={setDaysTimeWindow}
            contentFilter={contentFilter}
            setContentFilter={setContentFilter}
          />
        </TabsContent>
        <TabsContent value="display" className="mt-4">
          <DisplayTab
            items={viewSections}
            selectedFeedIds={selectedFeedIds}
            selectedCategories={selectedCategories}
            baseLayout={layout}
            onReorder={setViewSections}
            onRemove={(id) =>
              setViewSections((prev) => prev.filter((i) => i.id !== id))
            }
            onAdd={(item) => setViewSections((prev) => [...prev, item])}
            onLayoutChange={(id, newLayout) =>
              setViewSections((prev) =>
                prev.map((i) =>
                  i.id === id ? { ...i, layout: newLayout } : i,
                ),
              )
            }
            onBaseLayoutChange={setLayout}
          />
        </TabsContent>
      </Tabs>
      <div className="mt-6">
        <Button
          disabled={!canMutate || isDisabled || isAddingView}
          onClick={handleSave}
          className="w-full"
        >
          {isAddingView ? "Adding..." : "Add View"}
        </Button>
      </div>
    </ControlledResponsiveDialog>
  );
}
