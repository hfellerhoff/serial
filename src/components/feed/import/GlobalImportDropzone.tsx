"use client";

import { useNavigate } from "@tanstack/react-router";
import { FileUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getInitialFeedDataFromFiles } from "./utils/getInitialFeedDataFromFileInputElement";
import { useImportDropStore } from "~/lib/data/import-drop";

function containsFiles(dataTransfer: DataTransfer) {
  return (
    Array.from(dataTransfer.types).includes("Files") ||
    Array.from(dataTransfer.items).some((item) => item.kind === "file") ||
    dataTransfer.files.length > 0
  );
}

export function GlobalImportDropzone() {
  const navigate = useNavigate();
  const setPendingResult = useImportDropStore(
    (state) => state.setPendingResult,
  );
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const [isDraggingOpml, setIsDraggingOpml] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const resetDragState = () => {
      dragDepthRef.current = 0;
      setIsDraggingOpml(false);
    };

    const onDragEnter = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !containsFiles(dataTransfer)) return;

      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingOpml(true);
    };

    const onDragOver = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !containsFiles(dataTransfer)) return;

      event.preventDefault();
      dataTransfer.dropEffect = "copy";
      setIsDraggingOpml(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (dragDepthRef.current === 0) return;

      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingOpml(false);
      }
    };

    const onDrop = async (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !containsFiles(dataTransfer)) return;

      event.preventDefault();
      resetDragState();
      setIsProcessing(true);

      try {
        const result = await getInitialFeedDataFromFiles(dataTransfer.files);
        setPendingResult(result);
        await navigate({ to: "/import" });
      } finally {
        setIsProcessing(false);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", resetDragState);
    overlayRef.current?.setAttribute("data-ready", "true");

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", resetDragState);
    };
  }, [navigate, setPendingResult]);

  const isVisible = isDraggingOpml || isProcessing;

  return (
    <div
      ref={overlayRef}
      aria-hidden={!isVisible}
      className={`bg-background/90 pointer-events-none fixed inset-0 z-[100] grid place-items-center p-6 backdrop-blur-sm transition-opacity ${
        isVisible ? "visible opacity-100" : "invisible opacity-0"
      }`}
      data-testid="global-import-dropzone"
    >
      <div className="border-primary bg-background text-foreground grid h-full w-full place-items-center rounded-2xl border-2 border-dashed">
        <div className="flex flex-col items-center gap-4 text-center">
          <FileUpIcon className="text-primary size-12" />
          <div>
            <p className="text-xl font-semibold">
              {isProcessing ? "Processing import file…" : "Drop file here"}
            </p>
            <p className="text-muted-foreground mt-1">
              Import an OPML or Google Takeout subscriptions.csv file.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
