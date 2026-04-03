import { useQuery } from "@tanstack/react-query";
import { orpc } from "~/lib/orpc";

export function useSubscription() {
  const { data, isLoading } = useQuery({
    ...orpc.subscription.getStatus.queryOptions(),
    staleTime: 60_000,
  });

  return {
    billingEnabled: data?.billingEnabled ?? false,
    planId: data?.planId ?? "free",
    planName: data?.planName ?? "Free",
    maxActiveFeeds: data?.maxActiveFeeds ?? -1,
    activeFeeds: data?.activeFeeds ?? 0,
    backgroundRefreshIntervalMs: data?.backgroundRefreshIntervalMs ?? null,
    isLoading,
  };
}
