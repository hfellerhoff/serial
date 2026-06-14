"use client";

import { useMemo, useState } from "react";
import { DragHandleDots2Icon } from "@radix-ui/react-icons";
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
import {
  ChevronDown,
  Grid2x2,
  Grid3x3,
  LayoutTemplate,
  Rows2,
  Rows4,
  XIcon,
} from "lucide-react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { ViewLayout, ViewLayoutItemType } from "~/server/db/constants";
import { VIEW_LAYOUT, VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useFeeds } from "~/lib/data/feeds";
import { useContentCategories } from "~/lib/data/content-categories";

export interface ViewSection {
  id: string;
  itemType: ViewLayoutItemType;
  itemId: number;
  layout: ViewLayout | null;
}

const LAYOUT_OPTIONS: Array<{
  value: string;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    value: "__default__",
    label: "Default",
    icon: <LayoutTemplate className="size-3" />,
  },
  {
    value: VIEW_LAYOUT.LIST,
    label: "List",
    icon: <Rows4 className="size-3" />,
  },
  {
    value: VIEW_LAYOUT.LARGE_LIST,
    label: "Large List",
    icon: <Rows2 className="size-3" />,
  },
  {
    value: VIEW_LAYOUT.GRID,
    label: "Grid",
    icon: <Grid3x3 className="size-3" />,
  },
  {
    value: VIEW_LAYOUT.LARGE_GRID,
    label: "Large Grid",
    icon: <Grid2x2 className="size-3" />,
  },
];

function SectionSettingChip({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: Array<{ value: string; label: string; icon: React.ReactNode }>;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const displayValue = value ?? "__default__";
  const selectedOption = options.find((o) => o.value === displayValue);
  const selectedLabel = selectedOption?.label ?? "Default";
  const selectedIcon = selectedOption?.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="border-border bg-background hover:bg-muted flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors"
        >
          {selectedIcon}
          <span>{selectedLabel}</span>
          <ChevronDown className="size-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-1" align="end">
        <div className="grid gap-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors ${
                displayValue === opt.value
                  ? "bg-accent text-accent-foreground"
                  : ""
              }`}
              onClick={() => {
                onChange(opt.value === "__default__" ? null : opt.value);
                setOpen(false);
              }}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortableViewSectionItem({
  item,
  onRemove,
  onLayoutChange,
}: {
  item: ViewSection;
  onRemove: (id: string) => void;
  onLayoutChange: (id: string, layout: ViewLayout | null) => void;
}) {
  const { feeds } = useFeeds();
  const { contentCategories } = useContentCategories();

  const feed = feeds.find((f) => f.id === item.itemId);
  const tag = contentCategories.find((c) => c.id === item.itemId);
  const displayName =
    item.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED
      ? (feed?.name ?? "")
      : (tag?.name ?? "");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-view-section-row
      className="border-border bg-background flex items-center gap-2 rounded-md border px-3 py-2"
    >
      <div
        {...attributes}
        {...listeners}
        className="text-muted-foreground flex cursor-grab items-center"
      >
        <DragHandleDots2Icon className="size-4" />
      </div>
      <div className="flex flex-1 items-center gap-2">
        {item.itemType === VIEW_LAYOUT_ITEM_TYPE.FEED &&
          (feed?.imageUrl ? (
            <img
              src={feed.imageUrl}
              alt={feed.name}
              className="h-5 w-5 rounded object-contain"
            />
          ) : (
            <div className="bg-muted-foreground/20 h-5 w-5 rounded" />
          ))}
        {item.itemType === VIEW_LAYOUT_ITEM_TYPE.TAG && (
          <div className="bg-muted text-muted-foreground flex h-5 w-5 items-center justify-center rounded text-xs font-medium">
            #
          </div>
        )}
        <span className="text-sm">{displayName}</span>
      </div>
      <div className="flex items-center gap-1">
        <SectionSettingChip
          value={item.layout ?? null}
          options={LAYOUT_OPTIONS}
          onChange={(value) =>
            onLayoutChange(
              item.id,
              value === null ? null : (value as ViewLayout),
            )
          }
        />
      </div>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground rounded-sm p-1"
        onClick={() => onRemove(item.id)}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

interface ViewSectionListProps {
  items: ViewSection[];
  baseLayout: ViewLayout;
  onReorder: (items: ViewSection[]) => void;
  onRemove: (id: string) => void;
  onLayoutChange: (id: string, layout: ViewLayout | null) => void;
  onBaseLayoutChange: (layout: ViewLayout) => void;
}

export function ViewSectionList({
  items,
  baseLayout,
  onReorder,
  onRemove,
  onLayoutChange,
  onBaseLayoutChange,
}: ViewSectionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortableIds = useMemo(() => items.map((i) => i.id), [items]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      onReorder(arrayMove(items, oldIndex, newIndex));
    }
  }

  return (
    <div className="grid gap-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-2">
            {items.map((item) => (
              <SortableViewSectionItem
                key={item.id}
                item={item}
                onRemove={onRemove}
                onLayoutChange={onLayoutChange}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Uncategorized - fixed, non-draggable */}
      <div
        data-view-section-row
        className="border-border bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2"
      >
        <div className="size-4" />
        <span className="flex-1 text-sm font-medium">Uncategorized</span>
        <div className="flex items-center gap-1">
          <SectionSettingChip
            value={baseLayout}
            options={LAYOUT_OPTIONS.filter((o) => o.value !== "__default__")}
            onChange={(value) => onBaseLayoutChange(value as ViewLayout)}
          />
        </div>
        <div className="size-4" />
      </div>
    </div>
  );
}
