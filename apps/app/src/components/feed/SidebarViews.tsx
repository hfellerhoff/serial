"use client";

import { useState } from "react";

import { DragHandleDots2Icon } from "@radix-ui/react-icons";
import { useAtom, useAtomValue } from "jotai";
import { CircleSmall, Edit2Icon, PlusIcon, SettingsIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";

import {
  closestCenter,
  DndContext,
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
import { useDialogStore } from "./dialogStore";
import type { Dispatch, SetStateAction } from "react";
import type { DragEndEvent } from "@dnd-kit/core";

import type { ApplicationView } from "~/server/db/schema";
import { EditViewDialog } from "~/components/view-dialog";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { contentStatusFilterAtom, viewFilterIdAtom } from "~/lib/data/atoms";
import { useUpdateViewFilter, useViews } from "~/lib/data/views";
import {
  calculateViewsPlacement,
  useUpdateViewsPlacementMutation,
} from "~/lib/data/views/mutations";
import { useNavigationSnapshotStatus } from "~/lib/data/navigation/store";
import { Skeleton } from "~/components/ui/skeleton";
import { useSetViews } from "~/lib/data/views/store";
import {
  getViewContentAvailability,
  mixedContentStore,
} from "~/lib/data/mixed-content/store";
import { useCanMutate } from "~/lib/data/offline-mutations";

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
  const isActive = view.id === viewFilter;

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
          variant={isActive ? "outline" : "default"}
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
  const canMutate = useCanMutate();
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
  const { views } = useViews();
  const navigationSnapshotStatus = useNavigationSnapshotStatus();
  const mixedScopes = mixedContentStore.useScopes();
  const contentStatusFilter = useAtomValue(contentStatusFilterAtom);
  const setViews = useSetViews();

  const { mutateAsync: updateViewsPlacement } =
    useUpdateViewsPlacementMutation();

  const availability = views.map((view) =>
    getViewContentAvailability(mixedScopes, view.id, contentStatusFilter),
  );
  const viewOptions = views.map((view, index) => ({
    ...view,
    hasEntries: availability[index] ?? false,
  }));
  const viewPagesReady = availability.every((value) => value !== undefined);

  function handleDragEnd(event: DragEndEvent) {
    if (!canMutate) return;
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = views.findIndex((view) => view.id === active.id);
      const newIndex = views.findIndex((view) => view.id === over.id);
      const updatedViews = calculateViewsPlacement(
        arrayMove(views, oldIndex, newIndex),
      );

      setViews(updatedViews);
      void updateViewsPlacement({ views: updatedViews }).catch(() => {
        setViews(views);
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
            <SidebarMenuButton asChild>
              <Link to="/views">
                <SettingsIcon size={16} />
              </Link>
            </SidebarMenuButton>
            <SidebarMenuButton
              disabled={!canMutate}
              onClick={() => launchDialog("add-view")}
            >
              <PlusIcon />
            </SidebarMenuButton>
          </div>
        </SidebarGroupLabel>
        <SidebarMenu>
          {navigationSnapshotStatus !== "success" || !viewPagesReady ? (
            <div className="flex flex-col items-center gap-4 px-2 py-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton className="h-8 w-full" key={index} />
              ))}
            </div>
          ) : (
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
                {viewOptions.map((option) => {
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
          )}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
