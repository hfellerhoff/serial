import { toast } from "sonner";
import type { useSetFeedActiveMutation } from "~/lib/data/feeds/mutations";
import type { ManagedFeed } from "./useBulkFeedEditing";
import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

type SetFeedActive = ReturnType<typeof useSetFeedActiveMutation>["mutate"];

export function FeedRowBadges({
  ids,
  namesMap,
  variant,
  keyPrefix,
}: {
  ids: number[];
  namesMap: Map<number, string>;
  variant: "outline" | "secondary";
  keyPrefix: string;
}) {
  if (ids.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const name = namesMap.get(id);
        if (!name) return null;
        return (
          <Badge key={`${keyPrefix}-${id}`} variant={variant}>
            {name}
          </Badge>
        );
      })}
    </div>
  );
}

export function FeedActiveSwitch({
  feed,
  isTogglingActive,
  setFeedActive,
  activeFeeds,
  maxActiveFeeds,
}: {
  feed: ManagedFeed;
  isTogglingActive: boolean;
  setFeedActive: SetFeedActive;
  activeFeeds: number;
  maxActiveFeeds: number;
}) {
  return (
    <Switch
      checked={feed.isActive}
      disabled={isTogglingActive}
      onCheckedChange={(checked) => {
        if (!checked || activeFeeds < maxActiveFeeds || maxActiveFeeds < 0) {
          setFeedActive({ feedId: feed.id, isActive: checked });
        } else {
          if (IS_DEMO_INSTANCE) {
            toast.error(
              "Feed limit reached. This is the limit for the demo instance.",
            );
          } else {
            toast.error(
              "Feed limit reached. Upgrade your plan to activate more feeds.",
            );
          }
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
