import { cn } from "./lib/cn";
import type * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = ({
  className,
  type,
  ref,
  ...props
}: InputProps & React.RefAttributes<HTMLInputElement>) => (
  <input
    type={type}
    className={cn(
      "border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-3 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:py-1 md:text-sm",
      className,
    )}
    ref={ref}
    {...props}
  />
);
Input.displayName = "Input";

export { Input };
