"use client";

import { toast } from "sonner";
import type { Ref } from "react";
import type React from "react";
import type { ViewContentType, ViewLayout } from "~/server/db/constants";
import { ChipCombobox } from "~/components/ui/chip-combobox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useContentCategories } from "~/lib/data/content-categories";
import { useCreateContentCategoryMutation } from "~/lib/data/content-categories/mutations";
import { useFeeds } from "~/lib/data/feeds";
import { VIEW_CONTENT_TYPE, VIEW_LAYOUT } from "~/server/db/constants";

function AddViewToggleItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <ToggleGroupItem size="sm" variant="outline" value={value}>
      {children}
    </ToggleGroupItem>
  );
}

export function ViewNameInput({
  name,
  setName,
  inputRef,
}: {
  name: string;
  setName: (name: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="name">Name</Label>
      <Input
        ref={inputRef}
        id="name"
        type="text"
        value={name}
        placeholder="My View"
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
    </div>
  );
}

export function ViewTimeInput({
  daysWindow,
  setDaysWindow,
}: {
  daysWindow: number;
  setDaysWindow: (daysWindow: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="time-window">Time Window</Label>
      <ToggleGroup
        id="time-window"
        type="single"
        value={daysWindow.toString()}
        onValueChange={(value) => {
          if (!value) return;
          setDaysWindow(parseInt(value));
        }}
        size="sm"
        className="w-fit"
      >
        <AddViewToggleItem value="0">All time</AddViewToggleItem>
        <AddViewToggleItem value="1">Today</AddViewToggleItem>
        <AddViewToggleItem value="7">This Week</AddViewToggleItem>
        <AddViewToggleItem value="30">This Month</AddViewToggleItem>
      </ToggleGroup>
    </div>
  );
}

export function ViewLayoutInput({
  layout,
  setLayout,
  label = "Layout",
}: {
  layout: ViewLayout;
  setLayout: (layout: ViewLayout) => void;
  label?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="layout">{label}</Label>
      <ToggleGroup
        id="layout"
        type="single"
        value={layout}
        onValueChange={(value) => {
          if (!value) return;
          setLayout(value as ViewLayout);
        }}
        size="sm"
        className="w-fit"
      >
        <AddViewToggleItem value={VIEW_LAYOUT.LIST}>List</AddViewToggleItem>
        <AddViewToggleItem value={VIEW_LAYOUT.GRID}>Grid</AddViewToggleItem>
        <AddViewToggleItem value={VIEW_LAYOUT.LARGE_LIST}>
          Large List
        </AddViewToggleItem>
        <AddViewToggleItem value={VIEW_LAYOUT.LARGE_GRID}>
          Large Grid
        </AddViewToggleItem>
      </ToggleGroup>
    </div>
  );
}

const CONTENT_TYPE_HELPER_TEXT = {
  longform: "Shows articles and longform videos",
  "horizontal-video": "Shows longform videos",
  "vertical-video": "Shows shortform videos",
  all: "Shows all content",
} as const satisfies Record<ViewContentType, string>;

export function ViewContentTypeInput({
  contentType,
  setContentType,
}: {
  contentType: ViewContentType;
  setContentType: (contentType: ViewContentType) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="content-type">Content Type</Label>
      <ToggleGroup
        id="content-type"
        type="single"
        value={contentType}
        onValueChange={(value: ViewContentType) => {
          setContentType(value);
        }}
        size="sm"
        className="w-fit"
      >
        <AddViewToggleItem value={VIEW_CONTENT_TYPE.LONGFORM}>
          Standard
        </AddViewToggleItem>
        <AddViewToggleItem value={VIEW_CONTENT_TYPE.HORIZONTAL_VIDEO}>
          Videos
        </AddViewToggleItem>
        <AddViewToggleItem value={VIEW_CONTENT_TYPE.VERTICAL_VIDEO}>
          Shorts
        </AddViewToggleItem>
        <AddViewToggleItem value={VIEW_CONTENT_TYPE.ALL}>All</AddViewToggleItem>
      </ToggleGroup>
      <p className="text-muted-foreground text-sm">
        {CONTENT_TYPE_HELPER_TEXT[contentType]}
      </p>
    </div>
  );
}

function useCategoryOptions() {
  const { contentCategories } = useContentCategories();
  return contentCategories.map((c) => ({ id: c.id, label: c.name }));
}

function useFeedOptions() {
  const { feeds } = useFeeds();
  return feeds.map((f) => ({ id: f.id, label: f.name }));
}

export function ViewCategoriesInput({
  selectedCategories,
  setSelectedCategories,
}: {
  selectedCategories: number[];
  setSelectedCategories: (categories: number[]) => void;
}) {
  const categoryOptions = useCategoryOptions();
  const { mutateAsync: createContentCategory } =
    useCreateContentCategoryMutation();

  return (
    <ChipCombobox
      label="Tags"
      placeholder="Search tags..."
      options={categoryOptions}
      selectedIds={selectedCategories}
      onAdd={(id) => setSelectedCategories([...selectedCategories, id])}
      onRemove={(id) =>
        setSelectedCategories(selectedCategories.filter((c) => c !== id))
      }
      onCreate={async (name) => {
        try {
          const created = await createContentCategory({
            name,
            feedCategorizations: [],
          });
          if (created) {
            setSelectedCategories([...selectedCategories, created.id]);
          }
        } catch {
          toast.error("Failed to create tag.");
        }
      }}
      createLabel="Create tag"
    />
  );
}

export function ViewFeedsInput({
  selectedFeedIds,
  setSelectedFeedIds,
}: {
  selectedFeedIds: number[];
  setSelectedFeedIds: (feedIds: number[]) => void;
}) {
  const feedOptions = useFeedOptions();

  return (
    <ChipCombobox
      label="Feeds"
      placeholder="Search feeds..."
      options={feedOptions}
      selectedIds={selectedFeedIds}
      onAdd={(id) => setSelectedFeedIds([...selectedFeedIds, id])}
      onRemove={(id) =>
        setSelectedFeedIds(selectedFeedIds.filter((f) => f !== id))
      }
    />
  );
}
