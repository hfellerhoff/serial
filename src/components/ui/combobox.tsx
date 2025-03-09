"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useState } from "react";

type ComboboxProps<T extends string> = {
  options: {
    value: T;
    label: string;
  }[];
  onSelect: (value: T | null) => void;
  onAddOption?: (value: T) => void;
  value: T | null;
  label: string;
  placeholder: string;
  width?: number | "full";
};
export function Combobox<T extends string>({
  options,
  value,
  onSelect,
  onAddOption,
  label,
  width = 200,
  placeholder,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const computedWidth =
    width === "full" ? `${triggerRef.current?.clientWidth}px` : `${width}px`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
          style={{
            width: width === "full" ? "100%" : width,
          }}
        >
          {value
            ? options.find((option) => option.value === value)?.label
            : label}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
            placeholder={placeholder}
            onValueChange={(updatedValue) => {
              setLocalValue(updatedValue);
            }}
          />
          <CommandEmpty>
            {!onAddOption || !localValue ? (
              "No value found."
            ) : (
              <Button
                variant="default"
                onClick={() => {
                  onAddOption?.(localValue as T);
                }}
              >
                <span
                  className="truncate"
                  style={{
                    maxWidth: `calc(${computedWidth} - 80px)`,
                  }}
                >
                  Add &quot;{localValue}&quot;
                </span>
              </Button>
            )}
          </CommandEmpty>
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
                    onSelect(
                      currentValue === value ? null : (currentValue as T),
                    );
                    setOpen(false);
                  }}
                  className="data-disabled:pointer-events-auto data-disabled:opacity-100"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
