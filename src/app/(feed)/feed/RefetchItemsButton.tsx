"use client";

import { RefreshCwIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useFetchNewFeedItemsMutation } from "~/lib/data/feedItems";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

const ONE_HOUR = 1000 * 60 * 60;

export function RefetchItemsButton() {
  const pathname = usePathname();

  const { mutateAsync: fetchNewFeedItems, isPending } =
    useFetchNewFeedItemsMutation();

  useQuery({
    queryKey: ["fetch-items-on-mount"],
    queryFn: async () => {
      await fetchNewFeedItems();
      return true;
    },
    staleTime: ONE_HOUR,
  });

  if (pathname !== "/feed") return null;

  return (
    <Button
      size="icon md:default"
      variant="outline"
      onClick={() => {
        fetchNewFeedItems();
      }}
    >
      <RefreshCwIcon
        size={16}
        className={clsx({
          "animate-spin": isPending,
        })}
      />
      <span className="hidden pl-1.5 md:block">Refresh</span>
    </Button>
  );
}
