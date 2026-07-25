"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { badgeVariants } from "./badge";
import { Button } from "./button";
import { Label } from "./label";
import { cn } from "~/lib/utils";

export type SelectableChipOption = {
  id: number;
  label: string;
};

type SelectableChipListProps = {
  label: string;
  options: SelectableChipOption[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  prioritizedIds?: ReadonlySet<number>;
  emptyMessage?: string;
};

const MAX_ROWS = 5;
const RENDER_CHUNK = 100;

type PaginationState = {
  totalCount: number;
  orderKey: string;
  offset: number;
  currentPage: number;
};

function measureVisibleCount(container: HTMLElement) {
  const children = Array.from(container.children) as HTMLElement[];
  let rowCount = 0;
  let lastTop = -Infinity;
  let count = 0;
  let clipBottom = 0;

  for (const child of children) {
    const top = child.offsetTop;
    if (top > lastTop + 1) {
      rowCount++;
      if (rowCount > MAX_ROWS) break;
      lastTop = top;
    }
    count++;
    clipBottom = top + child.offsetHeight;
  }

  return { count, clipHeight: rowCount > MAX_ROWS ? clipBottom : 0 };
}

export function sortSelectableChipOptions(
  options: SelectableChipOption[],
  prioritizedIds: ReadonlySet<number>,
) {
  return [...options].sort((a, b) => {
    const priorityDifference =
      Number(prioritizedIds.has(b.id)) - Number(prioritizedIds.has(a.id));
    return priorityDifference || a.label.localeCompare(b.label);
  });
}

export function SelectableChipList({
  label,
  options,
  selectedIds,
  onToggle,
  prioritizedIds = new Set(),
  emptyMessage = `No ${label.toLowerCase()} available`,
}: SelectableChipListProps) {
  const sortedOptions = sortSelectableChipOptions(options, prioritizedIds);
  const selectedSet = new Set(selectedIds);
  const totalCount = sortedOptions.length;
  const orderKey = sortedOptions.map((option) => option.id).join(",");
  const [visibleCount, setVisibleCount] = useState(0);
  const [firstPageCount, setFirstPageCount] = useState(0);
  const maxClipHeightRef = useRef(0);
  const previousOffsetsRef = useRef<number[]>([]);
  const chipContainerRef = useRef<HTMLDivElement>(null);
  const measuredTotalCountRef = useRef(totalCount);
  const [pagination, setPagination] = useState<PaginationState>({
    totalCount,
    orderKey,
    offset: 0,
    currentPage: 1,
  });

  if (
    totalCount !== pagination.totalCount ||
    orderKey !== pagination.orderKey
  ) {
    setPagination({ totalCount, orderKey, offset: 0, currentPage: 1 });
  }

  const { offset, currentPage } = pagination;
  const renderOptions = sortedOptions.slice(offset, offset + RENDER_CHUNK);
  const hasMore = totalCount > 0 && offset + visibleCount < totalCount;
  const hasPrevious = offset > 0;
  const showPagination = hasMore || hasPrevious;
  const estimatedTotalPages =
    firstPageCount > 0 ? Math.ceil(totalCount / firstPageCount) : 1;

  useLayoutEffect(() => {
    if (totalCount !== measuredTotalCountRef.current) {
      measuredTotalCountRef.current = totalCount;
      maxClipHeightRef.current = 0;
      previousOffsetsRef.current = [];
    }

    const container = chipContainerRef.current;
    if (!container) return;

    container.style.maxHeight = "none";
    container.style.minHeight = "";
    const { count, clipHeight } = measureVisibleCount(container);
    const effectiveHeight =
      clipHeight > 0 ? clipHeight : container.offsetHeight;

    maxClipHeightRef.current = Math.max(
      maxClipHeightRef.current,
      effectiveHeight,
    );
    if (offset === 0 && count > 0) setFirstPageCount(count);
    container.style.maxHeight = clipHeight > 0 ? `${clipHeight}px` : "";
    if (maxClipHeightRef.current > 0) {
      container.style.minHeight = `${maxClipHeightRef.current}px`;
    }
    setVisibleCount(count);
  }, [offset, totalCount, orderKey]);

  const goForward = () => {
    previousOffsetsRef.current.push(offset);
    setPagination((previous) => ({
      totalCount,
      orderKey,
      offset: previous.offset + visibleCount,
      currentPage: previous.currentPage + 1,
    }));
  };

  const goBack = () => {
    const previousOffset = previousOffsetsRef.current.pop();
    if (previousOffset === undefined) return;
    setPagination((previous) => ({
      totalCount,
      orderKey,
      offset: previousOffset,
      currentPage: previous.currentPage - 1,
    }));
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {showPagination && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">
              {currentPage}/{estimatedTotalPages}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              disabled={!hasPrevious}
              onClick={goBack}
              aria-label={`Previous ${label.toLowerCase()} page`}
            >
              <ChevronLeftIcon size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              disabled={!hasMore}
              onClick={goForward}
              aria-label={`Next ${label.toLowerCase()} page`}
            >
              <ChevronRightIcon size={14} />
            </Button>
          </div>
        )}
      </div>
      {totalCount > 0 ? (
        <div
          ref={chipContainerRef}
          className="relative flex flex-wrap content-start gap-1 overflow-hidden"
        >
          {renderOptions.map((option) => {
            const isSelected = selectedSet.has(option.id);
            const isPrioritized = prioritizedIds.has(option.id);

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggle(option.id)}
                className={cn(
                  badgeVariants({
                    variant: isSelected ? "default" : "outline",
                  }),
                  "cursor-pointer",
                  isPrioritized &&
                    !isSelected &&
                    "border-primary/50 bg-primary/10 font-semibold",
                )}
              >
                <CheckIcon
                  aria-hidden="true"
                  className={cn(!isSelected && "opacity-0")}
                />
                {option.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      )}
    </div>
  );
}
