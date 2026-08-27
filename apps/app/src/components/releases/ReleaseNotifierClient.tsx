import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { getReleaseUrl } from "~/lib/constants";

const RELEASE_SLUG_KEY = "last-viewed-release";

export function ReleaseNotifierClient({ slug }: { slug: string | undefined }) {
  // This synchronizes a server-provided release slug with browser storage on
  // mount; there is no user event that can own the notification.
  // react-doctor-disable-next-line react-doctor/no-effect-event-handler
  useEffect(() => {
    if (!slug) return;

    const lastViewedSlug = window.localStorage.getItem(RELEASE_SLUG_KEY);

    if (lastViewedSlug === null) {
      window.localStorage.setItem(RELEASE_SLUG_KEY, slug);
      return;
    }

    if (lastViewedSlug !== slug) {
      window.localStorage.setItem(RELEASE_SLUG_KEY, slug);

      const toastId = toast(
        "There have been improvements to Serial since your last visit! Check out the release notes.",
        {
          action: (
            <a
              href={getReleaseUrl(slug)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="sm"
                onClick={() => {
                  toast.dismiss(toastId);
                }}
              >
                View
              </Button>
            </a>
          ),
          cancel: (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                toast.dismiss(toastId);
              }}
            >
              Close
            </Button>
          ),
          duration: Infinity,
        },
      );
    }
  }, [slug]);

  return null;
}
