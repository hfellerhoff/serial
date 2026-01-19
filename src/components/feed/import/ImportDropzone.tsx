import clsx from "clsx";
import { useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";

type ImportDropzoneProps = {
  inputElementRef: RefObject<HTMLInputElement | null> | null;
  onSelectFile: () => void;
};

export function ImportDropzone({
  inputElementRef,
  onSelectFile,
}: ImportDropzoneProps) {
  const dropzoneRef = useRef<HTMLButtonElement | null>(null);

  const [isDraggingOverDropzone, setIsDraggingOverDropzone] = useState(false);

  const onDragEvent = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleActivate = () => {
    inputElementRef?.current?.click();
  };

  return (
    <button
      type="button"
      ref={dropzoneRef}
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

        if (!inputElementRef?.current) return;

        const files = e.dataTransfer.files;
        const dataTransfer = new DataTransfer();

        Array.from(files).forEach((file) => {
          dataTransfer.items.add(file);
        });

        inputElementRef.current.files = dataTransfer.files;
        onSelectFile();
      }}
      onClick={handleActivate}
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
    </button>
  );
}
