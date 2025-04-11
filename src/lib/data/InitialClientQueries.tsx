"use client";

import { type PropsWithChildren } from "react";
import { useFeedsQuery } from "./feeds";
import { useFeedItemsQuery } from "./feed-items";

export function InitialClientQueries({ children }: PropsWithChildren) {
  // useFeedsQuery();
  useFeedItemsQuery();

  return children;
}
