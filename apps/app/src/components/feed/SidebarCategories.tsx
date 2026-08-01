"use client";

import { useState } from "react";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { CircleSmall, Edit2Icon, PlusIcon, SettingsIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useDialogStore } from "./dialogStore";
import { EditContentCategoryDialog } from "~/components/AddContentCategoryDialog";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useContentCategories } from "~/lib/data/content-categories";
import { useDeselectViewFilter } from "~/lib/data/views";
import {
  getNavigationAvailability,
  useNavigationSnapshot,
  useNavigationSnapshotStatus,
} from "~/lib/data/navigation/store";
import { Skeleton } from "~/components/ui/skeleton";

export function SidebarCategories() {
  const [
    selectedContentCategoryForEditing,
    setSelectedContentCategoryForEditing,
  ] = useState<null | number>(null);

  const setFeedFilter = useSetAtom(feedFilterAtom);
  const setDateFilter = useSetAtom(dateFilterAtom);
  const deselectViewFilter = useDeselectViewFilter();
  const [categoryFilter, setCategoryFilter] = useAtom(categoryFilterAtom);

  const launchDialog = useDialogStore((store) => store.launchDialog);

  const { contentCategories } = useContentCategories();
  const navigationSnapshot = useNavigationSnapshot();
  const navigationSnapshotStatus = useNavigationSnapshotStatus();
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  const categoryOptions = contentCategories.map((category) => ({
    ...category,
    hasEntries: getNavigationAvailability(navigationSnapshot.tags, category.id)[
      visibilityFilter
    ],
  }));

  const hasAnyItems = Object.values(navigationSnapshot.feeds).some(
    (availability) => availability[visibilityFilter],
  );

  const updateCategoryFilter = (category: number) => {
    setFeedFilter(-1);
    setCategoryFilter(category);
    setDateFilter(30);
    deselectViewFilter();
  };

  return (
    <>
      <EditContentCategoryDialog
        selectedContentCategoryId={selectedContentCategoryForEditing}
        onClose={() => setSelectedContentCategoryForEditing(null)}
      />
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="pr-0 pb-2">
          <span className="inline-block flex-1">Tags</span>
          <div className="flex w-fit items-center justify-end">
            <SidebarMenuButton asChild>
              <Link to="/tags">
                <SettingsIcon size={16} />
              </Link>
            </SidebarMenuButton>
            <SidebarMenuButton
              onClick={() => launchDialog("add-content-category")}
            >
              <PlusIcon />
            </SidebarMenuButton>
          </div>
        </SidebarGroupLabel>
        <SidebarMenu>
          {navigationSnapshotStatus !== "success" ? (
            <div className="flex flex-col items-center gap-4 px-2 py-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton className="h-8 w-full" key={index} />
              ))}
            </div>
          ) : (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  variant={categoryFilter === -1 ? "outline" : "default"}
                  onClick={() => {
                    updateCategoryFilter(-1);
                    setDateFilter(1);
                  }}
                >
                  {!hasAnyItems && (
                    <CircleSmall size={16} className="text-sidebar-accent" />
                  )}
                  {hasAnyItems && (
                    <div className="grid size-4 place-items-center">
                      <div className="bg-sidebar-accent size-2.5 rounded-full" />
                    </div>
                  )}
                  All
                </SidebarMenuButton>
              </SidebarMenuItem>
              {categoryOptions.map((option) => {
                return (
                  <SidebarMenuItem key={option.id} className="group flex gap-1">
                    <SidebarMenuButton
                      variant={
                        option.id === categoryFilter ? "outline" : "default"
                      }
                      onClick={() => updateCategoryFilter(option.id)}
                    >
                      {!option.hasEntries && (
                        <CircleSmall
                          size={16}
                          className="text-sidebar-accent"
                        />
                      )}
                      {option.hasEntries && (
                        <div className="grid size-4 place-items-center">
                          <div className="bg-sidebar-accent size-2.5 rounded-full" />
                        </div>
                      )}
                      {option.name}
                    </SidebarMenuButton>
                    <div className="group/button flex w-fit items-center justify-end">
                      <SidebarMenuButton
                        onClick={() =>
                          setSelectedContentCategoryForEditing(option.id)
                        }
                      >
                        <Edit2Icon className="opacity-30 transition-opacity group-hover/button:opacity-100" />
                      </SidebarMenuButton>
                    </div>
                  </SidebarMenuItem>
                );
              })}
            </>
          )}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
