"use client";

import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { badgeVariants } from "./component-variants";
import { Label } from "./label";
import { cn } from "./lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  sortSelectableChipOptions,
  type SelectableChipOption,
} from "./selectable-chip-list.utils";

export type { SelectableChipOption } from "./selectable-chip-list.utils";

type SelectableChipListProps = {
  label: string;
  options: SelectableChipOption[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onCreate?: (name: string) => void | Promise<void>;
  createLabel?: string;
  createPlaceholder?: string;
  prioritizedIds?: ReadonlySet<number>;
  emptyMessage?: string;
  disabled?: boolean;
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

function useChipRowPagination(totalCount: number, orderKey: string) {
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

  const hasMore = totalCount > 0 && offset + visibleCount < totalCount;
  const hasPrevious = offset > 0;
  const estimatedTotalPages =
    firstPageCount > 0 ? Math.ceil(totalCount / firstPageCount) : 1;

  return {
    chipContainerRef,
    offset,
    currentPage,
    hasMore,
    hasPrevious,
    showPagination: hasMore || hasPrevious,
    estimatedTotalPages,
    goForward,
    goBack,
  };
}

function useChipCreateFlow(
  options: SelectableChipOption[],
  onCreate: SelectableChipListProps["onCreate"],
  disabled: boolean,
) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createSearch, setCreateSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const trimmedCreateSearch = createSearch.trim();
  const hasExactCreateMatch = options.some(
    (option) =>
      option.label.toLowerCase() === trimmedCreateSearch.toLowerCase(),
  );
  const canCreate =
    Boolean(onCreate) &&
    !disabled &&
    Boolean(trimmedCreateSearch) &&
    !hasExactCreateMatch &&
    !isCreating;

  const handleCreate = async () => {
    if (!onCreate || !canCreate) return;
    setIsCreating(true);
    try {
      await onCreate(trimmedCreateSearch);
      setCreateSearch("");
      setCreateOpen(false);
    } catch {
      // The caller owns creation error messaging.
    } finally {
      setIsCreating(false);
    }
  };

  return {
    createOpen,
    setCreateOpen,
    createSearch,
    setCreateSearch,
    trimmedCreateSearch,
    hasExactCreateMatch,
    canCreate,
    handleCreate,
  };
}

function ChipCreatePopover({
  label,
  createLabel,
  createPlaceholder,
  disabled,
  createFlow,
}: {
  label: string;
  createLabel: string;
  createPlaceholder: string;
  disabled: boolean;
  createFlow: ReturnType<typeof useChipCreateFlow>;
}) {
  const createInputRef = useRef<HTMLInputElement>(null);
  const {
    createOpen,
    setCreateOpen,
    createSearch,
    setCreateSearch,
    trimmedCreateSearch,
    hasExactCreateMatch,
    canCreate,
    handleCreate,
  } = createFlow;

  return (
    <Popover
      open={createOpen}
      onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) setCreateSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={createLabel}
          disabled={disabled}
        >
          <PlusIcon size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command
          shouldFilter={false}
          className="[&_[cmdk-item]]:pointer-events-auto [&_[cmdk-item]]:opacity-100"
        >
          <CommandInput
            ref={createInputRef}
            placeholder={createPlaceholder}
            value={createSearch}
            onValueChange={setCreateSearch}
          />
          <CommandList>
            {!trimmedCreateSearch && (
              <CommandEmpty>Enter a name to create.</CommandEmpty>
            )}
            {hasExactCreateMatch && (
              <CommandEmpty>
                A {label.toLowerCase().replace(/s$/, "")} with this name
                already exists.
              </CommandEmpty>
            )}
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  onSelect={() => void handleCreate()}
                >
                  <PlusIcon className="mr-2 size-4" />
                  <span className="truncate">
                    {createLabel} &quot;{trimmedCreateSearch}&quot;
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ChipPaginationControls({
  label,
  pagination,
}: {
  label: string;
  pagination: ReturnType<typeof useChipRowPagination>;
}) {
  const { currentPage, estimatedTotalPages, hasPrevious, hasMore, goBack, goForward } =
    pagination;

  return (
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
  );
}

function ChipButton({
  option,
  isSelected,
  isPrioritized,
  disabled,
  onToggle,
}: {
  option: SelectableChipOption;
  isSelected: boolean;
  isPrioritized: boolean;
  disabled: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      disabled={disabled}
      onClick={() => onToggle(option.id)}
      className={cn(
        badgeVariants({
          variant: isSelected ? "default" : "outline",
        }),
        "max-w-full min-w-0 shrink cursor-pointer [&>svg]:shrink-0",
        isPrioritized && !isSelected && "border-primary/50",
        !isPrioritized && !isSelected && "border-dashed",
      )}
    >
      {isSelected ? (
        <CheckIcon aria-hidden="true" />
      ) : (
        <PlusIcon aria-hidden="true" className="text-muted-foreground" />
      )}
      <span className="truncate">{option.label}</span>
    </button>
  );
}

export function SelectableChipList({
  label,
  options,
  selectedIds,
  onToggle,
  onCreate,
  createLabel = `Create ${label.toLowerCase()}`,
  createPlaceholder = `New ${label.toLowerCase().replace(/s$/, "")} name...`,
  prioritizedIds = new Set(),
  emptyMessage = `No ${label.toLowerCase()} available`,
  disabled = false,
}: SelectableChipListProps) {
  const sortedOptions = sortSelectableChipOptions(options, prioritizedIds);
  const selectedSet = new Set(selectedIds);
  const totalCount = sortedOptions.length;
  const orderKey = sortedOptions.map((option) => option.id).join(",");
  const pagination = useChipRowPagination(totalCount, orderKey);
  const createFlow = useChipCreateFlow(options, onCreate, disabled);
  const renderOptions = sortedOptions.slice(
    pagination.offset,
    pagination.offset + RENDER_CHUNK,
  );

  return (
    <div
      className="grid min-w-0 gap-2"
      data-slot="selectable-chip-list"
      data-label={label}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>{label}</Label>
          {onCreate && (
            <ChipCreatePopover
              label={label}
              createLabel={createLabel}
              createPlaceholder={createPlaceholder}
              disabled={disabled}
              createFlow={createFlow}
            />
          )}
        </div>
        {pagination.showPagination && (
          <ChipPaginationControls label={label} pagination={pagination} />
        )}
      </div>
      {totalCount > 0 ? (
        <div
          ref={pagination.chipContainerRef}
          className="relative flex min-w-0 flex-wrap content-start gap-1 overflow-hidden"
        >
          {renderOptions.map((option) => (
            <ChipButton
              key={option.id}
              option={option}
              isSelected={selectedSet.has(option.id)}
              isPrioritized={prioritizedIds.has(option.id)}
              disabled={disabled}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      )}
    </div>
  );
}
