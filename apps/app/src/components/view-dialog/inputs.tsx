"use client";

import { toast } from "sonner";
import type { Ref } from "react";
import type React from "react";
import type { ViewLayout } from "~/server/db/constants";
import type {
  ContentFilter,
  ContentFilterOption,
} from "~/lib/views/contentFilter";
import { ChipCombobox } from "~/components/ui/chip-combobox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useContentCategories } from "~/lib/data/content-categories";
import { useCreateContentCategoryMutation } from "~/lib/data/content-categories/mutations";
import { useFeeds } from "~/lib/data/feeds";
import { VIEW_LAYOUT } from "~/server/db/constants";
import {
  CONTENT_FILTER_OPTION,
  decodeContentFilter,
  encodeContentFilter,
} from "~/lib/views/contentFilter";

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

const CONTENT_FILTER_LABEL = {
  [CONTENT_FILTER_OPTION.TEXT]: "text",
  [CONTENT_FILTER_OPTION.VIDEOS]: "videos",
  [CONTENT_FILTER_OPTION.SHORTS]: "shorts",
} as const satisfies Record<ContentFilterOption, string>;

export function ViewContentFilterInput({
  contentFilter,
  setContentFilter,
}: {
  contentFilter: ContentFilter;
  setContentFilter: (contentFilter: ContentFilter) => void;
}) {
  const selectedOptions = decodeContentFilter(contentFilter);
  const helperList = selectedOptions.map(
    (option) => CONTENT_FILTER_LABEL[option],
  );
  return (
    <div className="grid gap-2">
      <Label htmlFor="content-type">Content Type</Label>
      <ToggleGroup
        id="content-type"
        type="multiple"
        value={selectedOptions}
        onValueChange={(values: ContentFilterOption[]) => {
          if (values.length === 0) return;
          setContentFilter(encodeContentFilter(values));
        }}
        size="sm"
        className="w-fit"
      >
        <AddViewToggleItem value={CONTENT_FILTER_OPTION.TEXT}>
          Text
        </AddViewToggleItem>
        <AddViewToggleItem value={CONTENT_FILTER_OPTION.VIDEOS}>
          Videos
        </AddViewToggleItem>
        <AddViewToggleItem value={CONTENT_FILTER_OPTION.SHORTS}>
          Shorts
        </AddViewToggleItem>
      </ToggleGroup>
      <p className="text-muted-foreground text-sm">
        Shows {helperList.join(", ").replace(/, ([^,]*)$/, " and $1")}
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
