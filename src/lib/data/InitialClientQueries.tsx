"use client";

import { type PropsWithChildren } from "react";
import { useFeedsQuery } from "./feeds";
import { useFeedItemsQuery } from "./feed-items";
import { useViewsQuery } from "./views";

export function InitialClientQueries({ children }: PropsWithChildren) {
  useFeedsQuery();
  useFeedItemsQuery();
  useViewsQuery();

  return children;
}
