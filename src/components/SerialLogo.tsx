import { cn } from "~/lib/utils";

export function SerialLogo({ className }: { className?: string }) {
  return (
    <img
      src="/icon-256.png"
      alt="Serial Logo"
      className={cn("size-6 rounded-md", className)}
    />
  );
}
