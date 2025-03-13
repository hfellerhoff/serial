import clsx from "clsx";
import { DragEvent, useRef, useState } from "react";
import { parse } from "csv-parse";

const parser = parse({
  skipRecordsWithError: true,
});

type ImportDropzoneProps = {
  inputElement: HTMLInputElement | null;
  onSelectFile: () => void;
  filename: string;
};

export function ImportDropzone({
  inputElement,
  onSelectFile,
  filename,
}: ImportDropzoneProps) {
  const dropzoneRef = useRef<HTMLDivElement | null>(null);

  const [isDraggingOverDropzone, setIsDraggingOverDropzone] = useState(false);

  const onDragEvent = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (!!inputElement?.files?.length) {
    return null;
  }

  return (
    <div
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

        if (!inputElement) return;

        const files = e.dataTransfer.files;
        const dataTransfer = new DataTransfer();

        Array.from(files).forEach((file) => {
          dataTransfer.items.add(file);
        });

        inputElement.files = dataTransfer.files;
        onSelectFile();
      }}
      onClick={() => {
        inputElement?.click();
      }}
      className={clsx(
        "hover:bg-muted/30 border-muted grid h-64 w-full cursor-pointer place-items-center rounded-xl border border-dashed transition-colors",
        {
          "bg-muted/50": isDraggingOverDropzone,
        },
      )}
    >
      <div className="max-w-sm text-center">
        Drag and drop your {filename} file here, or click/tap to upload
      </div>
    </div>
  );
}
