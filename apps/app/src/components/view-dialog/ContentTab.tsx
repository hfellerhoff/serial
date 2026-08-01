"use client";

import {
  ViewCategoriesInput,
  ViewContentFilterInput,
  ViewFeedsInput,
  ViewNameInput,
  ViewTimeInput,
} from "./inputs";
import type { ContentFilter } from "~/lib/views/contentFilter";

interface ContentTabProps {
  name: string;
  setName: (name: string) => void;
  nameInputRef?: React.Ref<HTMLInputElement>;
  selectedCategories: number[];
  setSelectedCategories: (categories: number[]) => void;
  selectedFeedIds: number[];
  setSelectedFeedIds: (feedIds: number[]) => void;
  daysTimeWindow: number;
  setDaysTimeWindow: (daysTimeWindow: number) => void;
  contentFilter: ContentFilter;
  setContentFilter: (contentFilter: ContentFilter) => void;
}

export function ContentTab({
  name,
  setName,
  nameInputRef,
  selectedCategories,
  setSelectedCategories,
  selectedFeedIds,
  setSelectedFeedIds,
  daysTimeWindow,
  setDaysTimeWindow,
  contentFilter,
  setContentFilter,
}: ContentTabProps) {
  return (
    <div className="grid gap-6">
      <ViewNameInput name={name} setName={setName} inputRef={nameInputRef} />
      <ViewFeedsInput
        selectedFeedIds={selectedFeedIds}
        setSelectedFeedIds={setSelectedFeedIds}
      />
      <ViewCategoriesInput
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
      />
      <ViewTimeInput
        daysWindow={daysTimeWindow}
        setDaysWindow={setDaysTimeWindow}
      />
      <ViewContentFilterInput
        contentFilter={contentFilter}
        setContentFilter={setContentFilter}
      />
    </div>
  );
}
