"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useRouter } from "@tanstack/react-router";
import type { ElementRef } from "react";
import type React from "react";

export function UnstyledDialog({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  id: string;
  className?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<ElementRef<"dialog">>(null);

  useEffect(() => {
    if (!dialogRef.current?.open) {
      dialogRef.current?.showModal();
      dialogRef.current?.setAttribute("style", "opacity: 1;");
    }
  }, []);

  function onDismiss() {
    router.history.back();
  }

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className={clsx(
        className,
        "h-screen w-screen opacity-0 transition-opacity",
      )}
      onClose={onDismiss}
      onClick={onDismiss}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDismiss();
      }}
    >
      {children}
      {/* <button onClick={onDismiss} className="close-button" /> */}
    </dialog>,
    document.getElementById(id)!,
  );
}
