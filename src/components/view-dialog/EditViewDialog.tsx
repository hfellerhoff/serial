"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ContentTab } from "./ContentTab";
import { DisplayTab } from "./DisplayTab";
import type { ViewContentType, ViewLayout } from "~/server/db/constants";
import type { ApplicationView } from "~/server/db/schema";
import type { ViewSection } from "./ViewSectionList";
import { Button } from "~/components/ui/button";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import {
  useDeleteViewMutation,
  useEditViewMutation,
} from "~/lib/data/views/mutations";
import { useViews } from "~/lib/data/views";
import {
  VIEW_CONTENT_TYPE,
  VIEW_LAYOUT,
  VIEW_READ_STATUS,
  viewContentTypeSchema,
  viewLayoutSchema,
} from "~/server/db/constants";

function useBuildViewSectionsFromView(
  view: ApplicationView | undefined,
): ViewSection[] {
  const { feeds } = useFeeds();
  const { contentCategories } = useContentCategories();

  return useMemo(() => {
    if (!view) return [];
    return view.viewSections.map((sv) => ({
      id: `${sv.itemType}:${sv.itemId}`,
      itemType: sv.itemType,
      itemId: sv.itemId,
      layout: sv.layout as ViewLayout | null,
    }));
  }, [view, feeds, contentCategories]);
}

export function EditViewDialog({
  selectedViewId,
  onClose,
}: {
  selectedViewId: null | number;
  onClose: () => void;
}) {
  const [isUpdatingView, setIsUpdatingView] = useState(false);
  const [isDeletingView, setIsDeletingView] = useState(false);

  const { mutateAsync: editView } = useEditViewMutation();
  const { mutateAsync: deleteView } = useDeleteViewMutation();

  const [name, setName] = useState<string>("");
  const [daysTimeWindow, setDaysTimeWindow] = useState<number>(0);
  const [contentType, setContentType] = useState<ViewContentType>(
    VIEW_CONTENT_TYPE.LONGFORM,
  );
  const [layout, setLayout] = useState<ViewLayout>(VIEW_LAYOUT.LIST);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedFeedIds, setSelectedFeedIds] = useState<number[]>([]);
  const [viewSections, setViewSections] = useState<ViewSection[]>([]);

  const isFormDisabled = !name;

  const { views } = useViews();

  const selectedView = useMemo(
    () => views.find((v) => v.id === selectedViewId),
    [views, selectedViewId],
  );
  const initialViewSections = useBuildViewSectionsFromView(selectedView);

  const { feedCategories } = useFeedCategories();

  const feedIdsInView = useMemo(() => {
    const ids = new Set(selectedFeedIds);
    for (const fc of feedCategories) {
      if (selectedCategories.includes(fc.categoryId)) {
        ids.add(fc.feedId);
      }
    }
    return ids;
  }, [selectedFeedIds, selectedCategories, feedCategories]);

  const tagIdsInView = useMemo(() => {
    const ids = new Set(selectedCategories);
    for (const fc of feedCategories) {
      if (feedIdsInView.has(fc.feedId)) {
        ids.add(fc.categoryId);
      }
    }
    return ids;
  }, [selectedCategories, feedIdsInView, feedCategories]);

  useEffect(() => {
    if (!selectedViewId) return;

    const view = views.find((v) => v.id === selectedViewId);
    if (!view) return;

    setName(view.name);
    setDaysTimeWindow(view.daysWindow);
    const parsedContentType = viewContentTypeSchema.safeParse(view.contentType);
    setContentType(
      parsedContentType.success
        ? parsedContentType.data
        : VIEW_CONTENT_TYPE.LONGFORM,
    );
    const parsedLayout = viewLayoutSchema.safeParse(view.layout);
    setLayout(parsedLayout.success ? parsedLayout.data : VIEW_LAYOUT.LIST);
    setSelectedCategories(view.categoryIds);
    setSelectedFeedIds(view.feedIds);
  }, [views, selectedViewId]);

  useEffect(() => {
    setViewSections(initialViewSections);
  }, [initialViewSections]);

  // Auto-remove view sections for feeds/tags that are no longer in the view
  useEffect(() => {
    setViewSections((prev) =>
      prev.filter((item) => {
        if (item.itemType === "feed") {
          return feedIdsInView.has(item.itemId);
        }
        if (item.itemType === "tag") {
          return tagIdsInView.has(item.itemId);
        }
        return false;
      }),
    );
  }, [feedIdsInView, tagIdsInView]);

  const handleSave = async () => {
    if (selectedViewId === null) return;

    setIsUpdatingView(true);
    try {
      const editViewPromise = editView({
        name,
        id: selectedViewId,
        daysWindow: daysTimeWindow,
        readStatus: VIEW_READ_STATUS.UNREAD,
        contentType: contentType,
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
      toast.promise(editViewPromise, {
        loading: "Updating view...",
        success: () => {
          return "View updated!";
        },
        error: () => {
          return "Something went wrong updating your view.";
        },
      });
      onClose();
    } catch {
      // Error handled by toast.promise
    }

    setIsUpdatingView(false);
  };

  return (
    <ControlledResponsiveDialog
      open={selectedViewId !== null}
      onOpenChange={onClose}
      title="Edit View"
      footer={
        <div className="flex gap-2">
          <Button
            disabled={isDeletingView}
            className="flex-1"
            variant="destructive"
            onClick={async () => {
              if (selectedViewId === null) return;

              setIsDeletingView(true);
              try {
                const deleteViewPromise = deleteView({
                  id: selectedViewId,
                });
                toast.promise(deleteViewPromise, {
                  loading: "Deleting view...",
                  success: () => {
                    return "View deleted!";
                  },
                  error: () => {
                    return "Something went wrong deleting your view.";
                  },
                });
                onClose();
              } catch {
                // Error handled by toast.promise
              }

              setIsDeletingView(false);
            }}
          >
            {isDeletingView ? "Deleting..." : "Delete"}
          </Button>
          <Button
            disabled={isFormDisabled || isUpdatingView}
            onClick={handleSave}
            className="flex-1"
          >
            {isUpdatingView ? "Saving..." : "Save"}
          </Button>
        </div>
      }
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
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
            selectedFeedIds={selectedFeedIds}
            setSelectedFeedIds={setSelectedFeedIds}
            daysTimeWindow={daysTimeWindow}
            setDaysTimeWindow={setDaysTimeWindow}
            contentType={contentType}
            setContentType={setContentType}
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
    </ControlledResponsiveDialog>
  );
}
