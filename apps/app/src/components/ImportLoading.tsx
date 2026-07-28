import { Loader2Icon } from "lucide-react";
import { Progress } from "~/components/ui/progress";
import { useLoadingMode } from "~/lib/data/loading-machine";

export function ImportLoading() {
  const loading = useLoadingMode();

  const isImporting = loading.mode === "importing";
  const showFeedProgress = isImporting && loading.total > 0;

  return (
    <div className="bg-background fixed inset-0 flex h-screen w-screen flex-col items-center justify-center">
      {showFeedProgress ? (
        <>
          <Progress value={loading.progress} className="w-48" />
          <p className="text-muted-foreground pt-4 font-sans text-sm">
            Importing {loading.completed} of {loading.total} feeds...
          </p>
          {loading.errors > 0 && (
            <p className="text-muted-foreground/50 pt-2 font-sans text-sm">
              {loading.errors} feed{loading.errors !== 1 ? "s" : ""} failed to
              import
            </p>
          )}
        </>
      ) : (
        <Loader2Icon size={32} className="animate-spin" />
      )}
    </div>
  );
}
