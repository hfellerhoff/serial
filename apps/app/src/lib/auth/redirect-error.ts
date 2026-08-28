import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Messages for the ?error= param OAuth-style callbacks redirect with when
 * a flow fails server-side (denied consent, expired state, chain mismatch).
 */
const REDIRECT_ERROR_MESSAGES: Record<string, string> = {
  atproto: "Atmosphere sign-in failed. Please try again.",
};

/**
 * Toast a callback failure once, then let the caller clear the param.
 * `clearError` must go through the route's own navigate (not raw history)
 * so the router's validated search state drops the value too — otherwise a
 * later router-driven navigation would resurface it.
 */
export function useRedirectErrorToast(
  error: string | undefined,
  clearError: () => void,
): void {
  const hasProcessed = useRef(false);
  useEffect(() => {
    if (!error || hasProcessed.current) return;
    hasProcessed.current = true;
    toast.error(
      REDIRECT_ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.",
    );
    clearError();
  }, [error, clearError]);
}
