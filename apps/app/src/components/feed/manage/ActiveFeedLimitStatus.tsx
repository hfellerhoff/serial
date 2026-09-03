import type { LaunchDialog } from "./useBulkFeedEditing";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

export function ActiveFeedLimitStatus({
  billingEnabled,
  activeFeeds,
  maxActiveFeeds,
  planName,
  launchDialog,
}: {
  billingEnabled: boolean;
  activeFeeds: number;
  maxActiveFeeds: number;
  planName: string;
  launchDialog: LaunchDialog;
}) {
  return (
    <>
      {(billingEnabled || IS_DEMO_INSTANCE) &&
        maxActiveFeeds > 0 &&
        (IS_DEMO_INSTANCE
          ? activeFeeds <= maxActiveFeeds
          : activeFeeds < maxActiveFeeds) && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {activeFeeds} / {maxActiveFeeds} feeds active
              </p>
            </div>
            <Progress
              value={Math.min(100, (activeFeeds / maxActiveFeeds) * 100)}
            />
          </div>
        )}
      {billingEnabled &&
        maxActiveFeeds > 0 &&
        activeFeeds >= maxActiveFeeds && (
          <Alert className="mt-4">
            <AlertTitle>Max active feeds reached</AlertTitle>
            <AlertDescription>
              The {planName} plan supports a maximum of {maxActiveFeeds} feeds.
              You can add more than this, but only your active feeds will
              receive new content.
              <Button
                type="button"
                onClick={() =>
                  launchDialog("subscription", { subscriptionView: "picker" })
                }
                className="mt-4"
              >
                Upgrade your plan
              </Button>
            </AlertDescription>
          </Alert>
        )}
    </>
  );
}
