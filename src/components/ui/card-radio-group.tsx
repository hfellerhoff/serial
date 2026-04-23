"use client";

import { cn } from "~/lib/utils";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";

export type CardRadioOption<T extends string> = {
  value: T;
  title: string;
  description?: string;
  disabled?: boolean;
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
        const isDisabled = option.disabled === true;
        const id = `card-radio-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "bg-card text-card-foreground flex gap-3 rounded-xl border p-4 shadow-sm transition-colors",
              option.description ? "items-start" : "items-center",
              isDisabled
                ? "cursor-not-allowed opacity-50"
                : "hover:bg-accent/30 cursor-pointer",
              isSelected &&
                !isDisabled &&
                "border-primary ring-primary/30 ring-1",
            )}
          >
            <RadioGroupItem
              id={id}
              value={option.value}
              disabled={isDisabled}
              className={option.description ? "mt-1" : undefined}
            />
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
