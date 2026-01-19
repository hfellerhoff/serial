import { useEffect } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "../ui/button";

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
            // @ts-expect-error this is fine
            <Link to={`/releases/${slug}`} preload="viewport">
              <Button
                size="sm"
                onClick={() => {
                  toast.dismiss(toastId);
                }}
              >
                View
              </Button>
            </Link>
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
