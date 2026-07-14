import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { getReleaseUrl } from "~/lib/constants";

const RELEASE_SLUG_KEY = "last-viewed-release";

export function ReleaseNotifierClient({ slug }: { slug: string | undefined }) {
  useEffect(() => {
    if (!slug) return;

    const lastViewedSlug = window.localStorage.getItem(RELEASE_SLUG_KEY);

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
