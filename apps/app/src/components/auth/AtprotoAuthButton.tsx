import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AtprotoHandleSubmission } from "~/components/auth/AtprotoHandleField";
import { AtprotoHandleField } from "~/components/auth/AtprotoHandleField";
import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth-client";

/**
 * The Atmosphere (AT Protocol) entry point on the auth pages: a provider
 * button that expands in place into the shared handle step
 * (AtprotoHandleField), whose submission goes to the authorize endpoint.
 *
 * Deliberately deferred: the page's ?callbackURL= is not threaded through
 * the OAuth round trip — the callback's success redirect is fixed at "/"
 * in the plugin. Carrying it through the encrypted state payload is a
 * follow-up once a flow (extension connect) actually needs it.
 */

const AUTHORIZE_PATH = "/atproto/authorize";

const GENERIC_ERROR_MESSAGE =
  "Could not start Atmosphere sign in. Please try again.";

interface AtprotoAuthButtonProps {
  intent: "sign-in" | "sign-up";
  variant: "outline" | "default";
  /** The page's own submission state; busy-ness here stays internal. */
  disabled: boolean;
}

export function AtprotoAuthButton({
  intent,
  variant,
  disabled,
}: AtprotoAuthButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Escape-collapse should hand keyboard focus back to the trigger. */
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const submit = async (submission: AtprotoHandleSubmission) => {
    if (busy || disabled) return;
    setBusy(true);

    // An HTTP error resolves to { error }; a transport failure (offline,
    // DNS) rejects. Both degrade to a toast, and busy stays set only when
    // the redirect is actually underway.
    try {
      const { data, error } = await authClient.$fetch<{ url: string }>(
        AUTHORIZE_PATH,
        {
          method: "POST",
          body: {
            identifier: submission.identifier,
            ...(submission.did ? { did: submission.did } : {}),
          },
        },
      );

      if (error || !data?.url) {
        toast.error(error?.message ?? GENERIC_ERROR_MESSAGE);
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button
        ref={triggerRef}
        variant={variant}
        className="w-full"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {intent === "sign-in"
          ? "Sign in with Atmosphere"
          : "Sign up with Atmosphere"}
      </Button>
    );
  }

  return (
    <AtprotoHandleField
      id="atproto-identifier"
      label="Atmosphere handle"
      submitLabel="Continue"
      submitVariant={variant}
      busy={busy}
      disabled={disabled}
      focusOnMount
      onSubmit={(submission) => void submit(submission)}
      onCollapse={() => {
        returnFocus.current = true;
        setOpen(false);
      }}
    />
  );
}
