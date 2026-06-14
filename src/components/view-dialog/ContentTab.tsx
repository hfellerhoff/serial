"use client";

import {
  ViewCategoriesInput,
  ViewContentTypeInput,
  ViewFeedsInput,
  ViewNameInput,
  ViewTimeInput,
} from "./inputs";
import type { ViewContentType } from "~/server/db/constants";

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
  contentType: ViewContentType;
  setContentType: (contentType: ViewContentType) => void;
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
  contentType,
  setContentType,
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
      <ViewContentTypeInput
        contentType={contentType}
        setContentType={setContentType}
      />
    </div>
  );
}
