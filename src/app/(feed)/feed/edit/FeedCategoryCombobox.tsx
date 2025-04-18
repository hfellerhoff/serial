"use client";

import { ListFilterPlusIcon } from "lucide-react";
import * as React from "react";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

type FeedCategoryComboboxProps<T extends string> = {
  options:
    | {
        value: T;
        label: string;
      }[]
    | undefined;
  onSelect: (value: T) => void;
  onAddOption?: (value: T) => void;
  disabled: boolean;
};
export function FeedCategoryCombobox<T extends string>({
  options,
  onSelect,
  onAddOption,
  disabled,
}: FeedCategoryComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const computedWidth = 200;

  if (!options) return null;

  const doesLocalValueMatchOption = options.some(
    (option) => option.label === localValue,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="FeedCategoryCombobox"
          aria-expanded={open}
          size="icon"
          disabled={disabled}
        >
          <ListFilterPlusIcon size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{
          width: computedWidth,
        }}
      >
        <Command>
          <CommandInput
            placeholder="Enter a category"
            onValueChange={(updatedValue) => {
              setLocalValue(updatedValue);
            }}
          />
          <CommandGroup>
            {options
              .sort((a, b) => {
                if (a.label < b.label) return -1;
                if (a.label > b.label) return 1;
                return 0;
              })
              .map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    onSelect(currentValue as T);
                    setOpen(false);
                  }}
                  className="data-disabled:pointer-events-auto data-disabled:opacity-100"
                >
                  {option.label}
                </CommandItem>
              ))}
            {/* {!!localValue && !doesLocalValueMatchOption && (
              <CommandItem
                key="add-category"
                value="add-category"
                onSelect={(currentValue) => {
                  onSelect(currentValue as T);
                  setOpen(false);
                }}
                className="data-disabled:pointer-events-auto data-disabled:opacity-100"
              >
                + Add "{localValue}"
              </CommandItem>
            )} */}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
