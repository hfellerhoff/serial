import { Loader2, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface FeedDiscoveryInputProps {
  url: string;
  onUrlChange: (url: string) => void;
  onDiscover: () => void;
  isDiscovering: boolean;
  canDiscover: boolean;
}

export function FeedDiscoveryInput({
  url,
  onUrlChange,
  onDiscover,
  isDiscovering,
  canDiscover,
}: FeedDiscoveryInputProps) {
  return (
    <div className="flex gap-2">
      <Input
        id="url"
        type="url"
        value={url}
        placeholder="https://www.youtube.com/@example"
        onChange={(e) => onUrlChange(e.target.value)}
        disabled={isDiscovering}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canDiscover) {
            e.preventDefault();
            onDiscover();
          }
        }}
      />
      <Button
        type="button"
        disabled={!canDiscover || isDiscovering}
        onClick={onDiscover}
      >
        {isDiscovering ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        <span className="ml-1.5">Find</span>
      </Button>
    </div>
  );
}
