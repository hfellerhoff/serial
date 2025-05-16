"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";

import { DragHandleDots2Icon } from "@radix-ui/react-icons";
import { useAtom, useAtomValue } from "jotai";
import { CircleSmall, Edit2Icon, PlusIcon } from "lucide-react";
import { EditViewDialog } from "~/components/AddViewDialog";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  dateFilterAtom,
  useFeedItemsMap,
  useFeedItemsOrder,
  viewFilterIdAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { doesFeedItemPassFilters } from "~/lib/data/feed-items";
import { useFeeds } from "~/lib/data/feeds";
import { useUpdateViewFilter, useViews } from "~/lib/data/views";
import { useDialogStore } from "./dialogStore";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  calculateViewsPlacement,
  useUpdateViewsPlacementMutation,
} from "~/lib/data/views/mutations";
import type { ApplicationView } from "~/server/db/schema";

export function useCheckFilteredFeedItemsForView() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsMap = useFeedItemsMap();
  const { feedCategories } = useFeedCategories();
  const { feeds } = useFeeds();
  const { views } = useViews();

  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  return useCallback(
    (viewId: number) => {
      if (!feedItemsOrder || !feedCategories) return [];
      const viewFilter = views.find((view) => view.id === viewId) || null;

      return feedItemsOrder.filter(
        (item) =>
          feedItemsMap[item] &&
          doesFeedItemPassFilters(
            feedItemsMap[item],
            dateFilter,
            visibilityFilter,
            -1,
            feedCategories,
            -1,
            feeds,
            viewFilter,
          ),
      );
    },
    [
      feedItemsOrder,
      feedItemsMap,
      dateFilter,
      visibilityFilter,
      feedCategories,
      feeds,
      views,
    ],
  );
}

type ViewOption = ApplicationView & { hasEntries: boolean };

function ViewSidebarItem({
  view,
  setSelectedViewForEditing,
}: {
  view: ViewOption;
  setSelectedViewForEditing: Dispatch<SetStateAction<number | null>>;
}) {
  const updateViewFilter = useUpdateViewFilter();
  const [viewFilter] = useAtom(viewFilterIdAtom);

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: view.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SidebarMenuItem className="group flex gap-1">
        <SidebarMenuButton
          variant={view.id === viewFilter ? "outline" : "default"}
          onClick={() => updateViewFilter(view.id)}
        >
          {!view.hasEntries && <CircleSmall className="text-sidebar-accent" />}
          {view.hasEntries && (
            <div className="grid size-4 place-items-center">
              <div className="bg-sidebar-accent size-2.5 rounded-full" />
            </div>
          )}
          {view.name}
        </SidebarMenuButton>
        {!view.isDefault && (
          <div className="group/button flex w-fit items-center justify-end">
            <SidebarMenuButton
              onClick={() => setSelectedViewForEditing(view.id)}
            >
              <Edit2Icon className="opacity-30 transition-opacity group-hover/button:opacity-100" />
            </SidebarMenuButton>
          </div>
        )}
        {!view.isDefault && (
          <div
            {...listeners}
            className="flex w-8 cursor-grab items-center justify-start"
          >
            <DragHandleDots2Icon className="opacity-30 transition-opacity" />
          </div>
        )}
        {view.isDefault && (
          <div
            {...listeners}
            className="flex w-[calc(var(--spacing)_*_6.625)] cursor-grab items-center justify-start"
          >
            <DragHandleDots2Icon className="opacity-30 transition-opacity" />
          </div>
        )}
      </SidebarMenuItem>
    </div>
  );
}

export function SidebarViews() {
  const [selectedViewForEditing, setSelectedViewForEditing] = useState<
    null | number
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const launchDialog = useDialogStore((store) => store.launchDialog);
  const checkFilteredFeedItemsForView = useCheckFilteredFeedItemsForView();

  const { views, setViews } = useViews();

  const [viewOptions, setViewOptions] = useState<ViewOption[]>([]);

  const { mutateAsync: updateViewsPlacement } =
    useUpdateViewsPlacementMutation();

  useEffect(() => {
    setViewOptions(
      views?.map((view) => ({
        ...view,
        hasEntries: !!checkFilteredFeedItemsForView(view.id).length,
      })),
    );
  }, [views, checkFilteredFeedItemsForView]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!!over && active.id !== over?.id) {
      setViewOptions((options) => {
        const oldIndex = options.findIndex((view) => view.id === active.id);
        const newIndex = options.findIndex((view) => view.id === over.id);

        const updatedOptions = arrayMove(options, oldIndex, newIndex);

        const updatedViews = calculateViewsPlacement(
          updatedOptions.map((option) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { hasEntries, ...restOfOption } = option;
            return restOfOption;
          }),
        );

        void updateViewsPlacement({ views: updatedViews });

        return updatedOptions;
      });
    }
  }

  return (
    <>
      <EditViewDialog
        selectedViewId={selectedViewForEditing}
        onClose={() => setSelectedViewForEditing(null)}
      />
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="pr-0 pb-2">
          <span className="inline-block flex-1">Views</span>
          <div className="flex w-fit items-center justify-end">
            <SidebarMenuButton onClick={() => launchDialog("add-view")}>
              <PlusIcon />
            </SidebarMenuButton>
          </div>
        </SidebarGroupLabel>
        <SidebarMenu>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={viewOptions}
              strategy={verticalListSortingStrategy}
            >
              {viewOptions?.map((option) => {
                return (
                  <ViewSidebarItem
                    view={option}
                    key={option.id}
                    setSelectedViewForEditing={setSelectedViewForEditing}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
