import { Link } from "@tanstack/react-router";
import { ImportDropzone } from "./ImportDropzone";
import { Button } from "~/components/ui/button";
import { getGuidesUrl } from "~/lib/constants";

export function ImportInstructions({
  onSelectFiles,
}: {
  onSelectFiles: () => void;
}) {
  return (
    <>
      <p className="mt-2">Serial supports importing:</p>
      <ul className="mb-6 list-disc pl-4">
        <li>
          <code className="bg-muted text-foreground rounded px-1 py-0.5">
            subscriptions.csv
          </code>{" "}
          files from{" "}
          <a
            href={getGuidesUrl("/how-to-export-youtube-subscriptions")}
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            a Google Takeout export
          </a>
        </li>
        <li>
          <code className="bg-muted text-foreground rounded px-1 py-0.5">
            *.opml
          </code>{" "}
          files from another RSS reader&apos;s export
        </li>
      </ul>
      <ImportDropzone
        inputId="import-file-input"
        onSelectFile={onSelectFiles}
      />
    </>
  );
}

export function ImportFinished({ onReset }: { onReset: () => void }) {
  return (
    <>
      <p className="mt-2 mb-4">Import finished! Your list has been added.</p>
      <div className="flex gap-2">
        <Link to="/">
          <Button>Back to home</Button>
        </Link>
        <Button variant="outline" onClick={onReset}>
          Import more
        </Button>
      </div>
    </>
  );
}
