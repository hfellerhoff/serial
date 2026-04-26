"use client";

import {
  Check,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Label } from "~/components/ui/label";

export type ChipComboboxOption = {
  id: number;
  label: string;
};

type ChipComboboxProps = {
  label: string;
  placeholder: string;
  options: ChipComboboxOption[];
  selectedIds: number[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  onCreate?: (name: string) => void | Promise<void>;
  createLabel?: string;
  badgeVariant?: "default" | "outline" | "secondary";
  emptyMessage?: string;
};

/** Max visible rows of badges before pagination kicks in. */
const MAX_ROWS = 5;
/**
 * How many badges to render for measurement.
 * Must exceed what could possibly fit in MAX_ROWS so we can detect overflow.
 */
const RENDER_CHUNK = 100;

function measureVisibleCount(container: HTMLElement): {
  count: number;
  clipHeight: number;
} {
  const children = Array.from(container.children) as HTMLElement[];
  if (children.length === 0) return { count: 0, clipHeight: 0 };

  // Use offsetTop/offsetHeight instead of getBoundingClientRect so that
  // measurements are immune to CSS transforms on ancestor elements (e.g. the
  // dialog's zoom-in-95 open animation which scales to 0.95 on mount).
  // The container must have `position: relative` so it is the offsetParent.
  let rowCount = 0;
  let lastTop = -Infinity;
  let count = 0;
  let clipBottom = 0;

  for (const child of children) {
    const top = child.offsetTop;
    if (top > lastTop + 1) {
      // New row (with 1px tolerance for sub-pixel rounding)
      rowCount++;
      if (rowCount > MAX_ROWS) break;
      lastTop = top;
    }
    count++;
    clipBottom = top + child.offsetHeight;
  }

  return {
    count,
    clipHeight: rowCount > MAX_ROWS ? clipBottom : 0,
  };
}

export function ChipCombobox({
  label,
  placeholder,
  options,
  selectedIds,
  onAdd,
  onRemove,
  onCreate,
  createLabel,
  badgeVariant = "outline",
  emptyMessage = "No options found.",
}: ChipComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Pagination state
  const [offset, setOffset] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [firstPageCount, setFirstPageCount] = useState(0);
  const maxClipHeightRef = useRef(0);
  const prevOffsets = useRef<number[]>([]);
  const badgeContainerRef = useRef<HTMLDivElement>(null);

  const selectedSet = new Set(selectedIds);
  const selectedOptions = options
    .filter((o) => selectedSet.has(o.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Badges to render — enough to fill 5 rows and detect overflow
  const renderOptions = selectedOptions.slice(offset, offset + RENDER_CHUNK);
  const totalCount = selectedOptions.length;
  const hasMore = totalCount > 0 && offset + visibleCount < totalCount;
  const hasPrev = offset > 0;
  const showPagination = hasMore || hasPrev;
  // Estimate total pages from first page's count (best available approximation)
  const estimatedTotalPages =
    firstPageCount > 0 ? Math.ceil(totalCount / firstPageCount) : 1;

  // Reset pagination navigation when selection count changes.
  // Note: visibleCount and firstPageCount are measurement outputs —
  // they are recalculated by the useLayoutEffect below whenever
  // offset or totalCount changes.  Resetting them here (in a regular
  // useEffect that fires *after* paint) would clobber the values the
  // layout effect already computed, leaving pagination stuck at "1/1".
  useEffect(() => {
    setOffset(0);
    setCurrentPage(1);
    maxClipHeightRef.current = 0;
    prevOffsets.current = [];
  }, [totalCount]);

  // Measure how many badges fit in MAX_ROWS rows and clip the container.
  // useLayoutEffect runs synchronously before paint, so there's no flicker.
  useLayoutEffect(() => {
    const container = badgeContainerRef.current;
    if (!container) return;

    // Remove clip to measure natural layout
    container.style.maxHeight = "none";
    container.style.minHeight = "";

    const { count, clipHeight } = measureVisibleCount(container);

    // Track the tallest page so the container doesn't collapse on the last page
    const effectiveHeight =
      clipHeight > 0 ? clipHeight : container.offsetHeight;
    if (effectiveHeight > maxClipHeightRef.current) {
      maxClipHeightRef.current = effectiveHeight;
    }

    // Store first page's count for total page estimation
    if (offset === 0 && count > 0) {
      setFirstPageCount(count);
    }

    if (clipHeight > 0) {
      container.style.maxHeight = `${clipHeight}px`;
    } else {
      container.style.maxHeight = "";
    }

    // Prevent height collapse on pages with fewer items
    if (maxClipHeightRef.current > 0) {
      container.style.minHeight = `${maxClipHeightRef.current}px`;
    }

    setVisibleCount(count);
  }, [offset, totalCount]);

  const goForward = useCallback(() => {
    prevOffsets.current.push(offset);
    setOffset(offset + visibleCount);
    setCurrentPage((p) => p + 1);
  }, [offset, visibleCount]);

  const goBack = useCallback(() => {
    const prev = prevOffsets.current.pop();
    if (prev !== undefined) {
      setOffset(prev);
      setCurrentPage((p) => p - 1);
    }
  }, []);

  // Search / filter state
  const trimmedSearch = search.trim();
  const lowerSearch = trimmedSearch.toLowerCase();
  const filteredOptions = (
    trimmedSearch
      ? options.filter((o) => o.label.toLowerCase().includes(lowerSearch))
      : options
  )
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));
  const hasExactMatch = options.some(
    (o) => o.label.toLowerCase() === lowerSearch,
  );
  const canCreate = !!onCreate && !!trimmedSearch && !hasExactMatch;

  const handleCreate = async () => {
    if (!onCreate || !trimmedSearch) return;
    await onCreate(trimmedSearch);
    setSearch("");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>{label}</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                type="button"
              >
                <PlusIcon size={14} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0" align="start">
              <Command
                shouldFilter={false}
                // cmdk inside Radix Dialog incorrectly sets data-[disabled]
                // on items, which kills pointer events. Override here.
                className="[&_[cmdk-item]]:pointer-events-auto [&_[cmdk-item]]:opacity-100"
              >
                <CommandInput
                  ref={inputRef}
                  placeholder={placeholder}
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  {filteredOptions.length === 0 && !canCreate && (
                    <CommandEmpty>{emptyMessage}</CommandEmpty>
                  )}
                  <CommandGroup>
                    {filteredOptions.map((option) => {
                      const isSelected = selectedSet.has(option.id);
                      return (
                        <CommandItem
                          key={option.id}
                          value={String(option.id)}
                          onSelect={() => {
                            if (isSelected) {
                              onRemove(option.id);
                            } else {
                              onAdd(option.id);
                            }
                            setSearch("");
                            requestAnimationFrame(() => {
                              inputRef.current?.focus();
                            });
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              isSelected ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {option.label}
                        </CommandItem>
                      );
                    })}
                    {canCreate && (
                      <CommandItem value="__create__" onSelect={handleCreate}>
                        <PlusIcon className="mr-2 h-4 w-4" />
                        <span className="truncate">
                          {createLabel ?? "Create"} &quot;{trimmedSearch}&quot;
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        {showPagination && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">
              {currentPage}/{estimatedTotalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              type="button"
              disabled={!hasPrev}
              onClick={goBack}
            >
              <ChevronLeftIcon size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              type="button"
              disabled={!hasMore}
              onClick={goForward}
            >
              <ChevronRightIcon size={14} />
            </Button>
          </div>
        )}
      </div>
      {selectedOptions.length > 0 ? (
        <div
          ref={badgeContainerRef}
          className="relative flex flex-wrap content-start gap-1 overflow-hidden"
        >
          {renderOptions.map((option) => (
            <Badge
              key={option.id}
              variant={badgeVariant}
              className="gap-1 pr-1"
            >
              {option.label}
              <button
                type="button"
                className="hover:bg-muted rounded-sm p-0.5"
                onClick={() => onRemove(option.id)}
              >
                <XIcon size={12} />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No {label.toLowerCase()} selected
        </p>
      )}
    </div>
  );
}
