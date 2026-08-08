import { Loader2 } from "lucide-react";

export function ExtensionLoadingView() {
  return (
    <main
      className="grid min-h-[380px] place-items-center"
      role="status"
      aria-label="Loading"
    >
      <Loader2 className="text-muted-foreground size-5 animate-spin" />
    </main>
  );
}
