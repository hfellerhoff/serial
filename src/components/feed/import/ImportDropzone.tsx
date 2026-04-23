import clsx from "clsx";
import { useState } from "react";
import type { DragEvent } from "react";

type ImportDropzoneProps = {
  inputId: string;
  onSelectFile: () => void;
};

export function ImportDropzone({ inputId, onSelectFile }: ImportDropzoneProps) {
  const [isDraggingOverDropzone, setIsDraggingOverDropzone] = useState(false);

  const onDragEvent = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <label
      htmlFor={inputId}
      onDrag={onDragEvent}
      onDragStart={onDragEvent}
      onDragEnter={onDragEvent}
      onDragEnd={onDragEvent}
      onDragOver={(e) => {
        onDragEvent(e);
        setIsDraggingOverDropzone(true);
      }}
      onDragLeave={(e) => {
        onDragEvent(e);
        setIsDraggingOverDropzone(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOverDropzone(false);

        const input = document.getElementById(
          inputId,
        ) as HTMLInputElement | null;
        if (!input) return;

        const files = e.dataTransfer.files;
        const dataTransfer = new DataTransfer();

        Array.from(files).forEach((file) => {
          dataTransfer.items.add(file);
        });

        input.files = dataTransfer.files;
        onSelectFile();
      }}
      className={clsx(
        "hover:bg-muted/30 border-foreground/40 grid h-64 w-full cursor-pointer place-items-center rounded-xl border border-dashed transition-colors",
        {
          "bg-muted/50": isDraggingOverDropzone,
        },
      )}
    >
      <div className="max-w-sm text-center">
        Drag and drop your file here, or click/tap to upload
      </div>
    </label>
  );
}
