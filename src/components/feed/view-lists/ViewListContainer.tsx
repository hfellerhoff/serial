import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface ViewListContainerProps {
  children: ReactNode;
  className?: string;
}

export function ViewListContainer({
  children,
  className,
}: ViewListContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)}>{children}</div>
  );
}
