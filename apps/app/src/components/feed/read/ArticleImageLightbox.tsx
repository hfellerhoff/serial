"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogOverlay, DialogPortal } from "~/components/ui/dialog";

interface ArticleImageLightboxProps {
  src: string;
  alt?: string;
  className?: string;
  protectedRemote?: boolean;
}

export function ArticleImageLightbox({
  src,
  alt,
  className,
  protectedRemote = false,
}: ArticleImageLightboxProps) {
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen((prev) => !prev);

  return (
    <div data-lightbox style={{ position: "relative" }}>
      <button
        data-lightbox-trigger
        type="button"
        aria-label={alt ? `Open image preview: ${alt}` : "Open image preview"}
        style={{ display: "block", cursor: "zoom-in" }}
        onClick={toggle}
      >
        <img
          src={src}
          alt={alt}
          className={className}
          loading={protectedRemote ? "lazy" : undefined}
          decoding={protectedRemote ? "async" : undefined}
          referrerPolicy={protectedRemote ? "no-referrer" : undefined}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            className="fixed inset-4 z-50 flex items-center justify-center focus:outline-none"
            onClick={() => setOpen(false)}
          >
            <DialogPrimitive.Title className="sr-only">
              Image preview
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Full-size image preview
            </DialogPrimitive.Description>
            <img
              src={src}
              alt={alt}
              referrerPolicy={protectedRemote ? "no-referrer" : undefined}
              className="rounded object-contain"
              style={{ maxWidth: "100%", maxHeight: "100%" }}
            />
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
