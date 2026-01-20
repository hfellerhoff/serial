import { Loader2Icon } from "lucide-react";

export function PaginationLoader() {
  return (
    <>
      <div className="h-8" />
      <div className="pointer-events-none fixed inset-x-0 bottom-8 grid place-items-center">
        <div className="bg-background flex size-8 items-center justify-center gap-1.5 rounded-full border shadow-xl">
          <Loader2Icon size={16} className="animate-spin" />
        </div>
      </div>
    </>
  );
}
