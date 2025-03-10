"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import Link from "next/link";

const RELEASE_SLUG_KEY = "last-viewed-release";

export function ReleaseNotifierClient({ slug }: { slug: string | undefined }) {
  useEffect(() => {
    if (!slug) return;

    const lastViewedSlug = window.localStorage.getItem(RELEASE_SLUG_KEY);

    if (lastViewedSlug !== slug) {
      const toastId = toast(
        "There have been improvements to Serial since your last visit! Check out the release notes.",
        {
          action: (
            <Link href={`/releases/${slug}`}>
              <Button
                size="sm"
                onClick={() => {
                  window.localStorage.setItem(RELEASE_SLUG_KEY, slug);
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
                window.localStorage.setItem(RELEASE_SLUG_KEY, slug);
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
  }, []);

  return null;
}
