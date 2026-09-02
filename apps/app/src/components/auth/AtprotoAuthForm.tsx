import { useState } from "react";
import { toast } from "sonner";
import type { AtprotoHandleSubmission } from "~/components/auth/AtprotoHandleField";
import { AtprotoHandleField } from "~/components/auth/AtprotoHandleField";
import { authClient } from "~/lib/auth-client";

/**
 * The Atmosphere (AT Protocol) entry point on the auth pages: the shared
 * handle step (AtprotoHandleField) wired to the authorize endpoint.
 * Rendered expanded — inline when Atmosphere is the primary method, and
 * inside the secondary-method subscreen otherwise.
 *
 * Deliberately deferred: the page's ?callbackURL= is not threaded through
 * the OAuth round trip — the callback's success redirect is fixed at "/"
 * in the plugin. Carrying it through the encrypted state payload is a
 * follow-up once a flow (extension connect) actually needs it.
 */

const AUTHORIZE_PATH = "/atproto/authorize";

const GENERIC_ERROR_MESSAGE =
  "Could not start Atmosphere sign in. Please try again.";

interface AtprotoAuthFormProps {
  /** The page's own submission state; busy-ness here stays internal. */
  disabled: boolean;
  focusOnMount?: boolean;
}

export function AtprotoAuthForm({
  disabled,
  focusOnMount = false,
}: AtprotoAuthFormProps) {
  const [busy, setBusy] = useState(false);

  const submit = async (submission: AtprotoHandleSubmission) => {
    if (busy || disabled) return;
    setBusy(true);

    // An HTTP error resolves to { error }; a transport failure (offline,
    // DNS) rejects. Both degrade to a toast, and busy stays set only when
    // the redirect is actually underway.
    let redirectStarted = false;
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
        return;
      }
      redirectStarted = true;
      window.location.assign(data.url);
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      // Deliberately conditional: once the redirect is underway the form
      // must stay busy until the page unloads.
      // react-doctor-disable-next-line react-doctor/no-loading-flag-reset-outside-finally
      if (!redirectStarted) setBusy(false);
    }
  };

  return (
    <AtprotoHandleField
      id="atproto-identifier"
      label="Atmosphere handle"
      submitLabel="Continue"
      submitVariant="default"
      size="lg"
      busy={busy}
      disabled={disabled}
      focusOnMount={focusOnMount}
      onSubmit={(submission) => void submit(submission)}
    />
  );
}
