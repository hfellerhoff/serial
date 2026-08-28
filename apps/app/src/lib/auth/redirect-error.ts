import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Messages for the ?error= param OAuth-style callbacks redirect with when
 * a flow fails server-side (denied consent, expired state, chain mismatch).
 */
const REDIRECT_ERROR_MESSAGES: Record<string, string> = {
  atproto: "Atmosphere authentication failed. Please try again.",
};

/**
 * The navigate signature both auth routes share: a replace-mode functional
 * search update that clears `error` and keeps everything else.
 */
type ClearErrorNavigate = (options: {
  search: (prev: { error?: string }) => { error: undefined };
  replace: boolean;
}) => Promise<void>;

/**
 * Toast a callback failure once, then strip the param. The strip goes
 * through the route's own navigate (not raw history) so the router's
 * validated search state drops the value too — otherwise a later
 * router-driven navigation would resurface it.
 */
export function useRedirectErrorToast(
  error: string | undefined,
  navigate: ClearErrorNavigate,
): void {
  const hasProcessed = useRef(false);
  useEffect(() => {
    if (!error || hasProcessed.current) return;
    hasProcessed.current = true;
    toast.error(
      REDIRECT_ERROR_MESSAGES[error] ??
        "Authentication failed. Please try again.",
    );
    void navigate({
      search: (prev) => ({ ...prev, error: undefined }),
      replace: true,
    });
    // navigate's identity is unstable across renders; the ref guard plus
    // the error param emptying make one run the only possible outcome.
  }, [error, navigate]);
}
