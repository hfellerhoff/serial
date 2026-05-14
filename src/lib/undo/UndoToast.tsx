import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { UNDO_TOAST_DURATION_MS } from "./types";
import type { UndoAction } from "./types";
import { Button } from "~/components/ui/button";
import { KeyboardShortcutDisplay } from "~/components/ButtonWithShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";

interface UndoToastProps {
  toastId: string | number;
  action: UndoAction;
}

export function UndoToast({ toastId, action }: UndoToastProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const pausedDurationRef = useRef(0);
  const lastPauseTimeRef = useRef(0);
  const isPausedRef = useRef(false);

  useEffect(() => {
    const startTime = Date.now();
    const intervalId = setInterval(() => {
      if (isPausedRef.current) return;

      const elapsed = Date.now() - startTime - pausedDurationRef.current;
      const pct = Math.min((elapsed / UNDO_TOAST_DURATION_MS) * 100, 100);

      if (progressRef.current) {
        progressRef.current.style.width = `${pct}%`;
      }

      if (pct >= 100) {
        clearInterval(intervalId);
      }
    }, 50);

    return () => clearInterval(intervalId);
  }, []);

  const handleMouseEnter = useCallback(() => {
    isPausedRef.current = true;
    lastPauseTimeRef.current = Date.now();
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPausedRef.current = false;
    pausedDurationRef.current += Date.now() - lastPauseTimeRef.current;
  }, []);

  const handleUndo = useCallback(async () => {
    toast.dismiss(toastId);
    try {
      await action.onUndo();
    } catch {
      toast.error("Failed to undo action");
    }
  }, [toastId, action]);

  return (
    <div
      className="border-border bg-background w-full overflow-hidden rounded-lg border shadow-lg md:w-[356px]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-foreground text-sm font-medium">
          {action.message}
        </span>
        <div className="relative">
          <Button size="sm" variant="outline" onClick={handleUndo}>
            Undo
          </Button>
          <KeyboardShortcutDisplay
            shortcut={SHORTCUT_KEYS.UNDO}
            className="-top-2 -right-3"
          />
        </div>
      </div>
      <div className="bg-muted h-1 w-full">
        <div
          ref={progressRef}
          className="bg-primary h-full"
          style={{ width: "0%" }}
        />
      </div>
    </div>
  );
}
