"use client";

import { useMemo } from "react";
import { ChipCombobox } from "~/components/ui/chip-combobox";
import { useFeeds } from "~/lib/data/feeds";

export function CategoryFeedsInput({
  selectedFeedIds,
  setSelectedFeedIds,
}: {
  selectedFeedIds: number[];
  setSelectedFeedIds: (feedIds: number[]) => void;
}) {
  const { feeds } = useFeeds();
  const feedOptions = useMemo(
    () => feeds.map((feed) => ({ id: feed.id, label: feed.name })),
    [feeds],
  );

  return (
    <ChipCombobox
      label="Feeds"
      placeholder="Search feeds..."
      options={feedOptions}
      selectedIds={selectedFeedIds}
      onAdd={(id) => setSelectedFeedIds([...selectedFeedIds, id])}
      onRemove={(id) =>
        setSelectedFeedIds(selectedFeedIds.filter((feedId) => feedId !== id))
      }
    />
  );
}
