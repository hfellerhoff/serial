"use client";

import { Check, PlusIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
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

  const selectedSet = new Set(selectedIds);
  const selectedOptions = options
    .filter((o) => selectedSet.has(o.id))
    .sort((a, b) => a.label.localeCompare(b.label));

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
      {selectedOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
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
