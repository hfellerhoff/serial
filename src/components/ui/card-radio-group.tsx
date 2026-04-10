"use client";

import { cn } from "~/lib/utils";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";

export type CardRadioOption<T extends string> = {
  value: T;
  title: string;
  description?: string;
};

type CardRadioGroupProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<CardRadioOption<T>>;
  orientation?: "responsive" | "vertical";
  className?: string;
};

export function CardRadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  orientation = "responsive",
  className,
}: CardRadioGroupProps<T>) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      className={cn(
        "grid gap-3",
        orientation === "responsive" && "sm:grid-cols-2",
        className,
      )}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const id = `card-radio-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "bg-card text-card-foreground hover:bg-accent/30 flex cursor-pointer items-start gap-3 rounded-xl border p-4 shadow-sm transition-colors",
              isSelected && "border-primary ring-primary/30 ring-1",
            )}
          >
            <RadioGroupItem id={id} value={option.value} className="mt-1" />
            <div className="grid gap-1">
              <span className="text-sm leading-none font-semibold">
                {option.title}
              </span>
              {option.description && (
                <span className="text-muted-foreground text-xs">
                  {option.description}
                </span>
              )}
            </div>
          </label>
        );
      })}
    </RadioGroup>
  );
}
