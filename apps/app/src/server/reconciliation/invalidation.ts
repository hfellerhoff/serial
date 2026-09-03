import type { ReconciliationInvalidationSummary } from "~/lib/reconciliation";
import { getUserChannel } from "~/server/api/channels";
import { publisher } from "~/server/api/publisher";

export { organizationInvalidationSummary } from "~/lib/reconciliation/invalidation";

export function publishReconciliationInvalidation(
  userId: string,
  summary: ReconciliationInvalidationSummary,
) {
  return publisher.publish(getUserChannel(userId), {
    source: "invalidation",
    chunk: summary,
  });
}
