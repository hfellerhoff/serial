"use client";

import { type ElementRef, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import clsx from "clsx";

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
    router.back();
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className={clsx(
        className,
        "h-screen w-screen opacity-0 transition-opacity",
      )}
      onClose={onDismiss}
      onClick={onDismiss}
    >
      {children}
      {/* <button onClick={onDismiss} className="close-button" /> */}
    </dialog>,
    document.getElementById(id)!,
  );
}
