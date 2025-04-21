"use client";

import { useAtom } from "jotai";
import { useEffect, type PropsWithChildren } from "react";
import { hasSetInitialViewAtom } from "./atoms";
import { useContentCategoriesQuery } from "./content-categories";
import { useFeedItemsQuery } from "./feed-items";
import { useFeedsQuery } from "./feeds";
import { useUpdateViewFilter, useViews } from "./views";

export function InitialClientQueries({ children }: PropsWithChildren) {
  useFeedsQuery();
  useFeedItemsQuery();
  useContentCategoriesQuery();

  const [hasSetInitialView, setHasSetInitialView] = useAtom(
    hasSetInitialViewAtom,
  );
  const { views } = useViews();
  const updateViewFilter = useUpdateViewFilter();

  useEffect(() => {
    if (!!views?.length && !hasSetInitialView) {
      setHasSetInitialView(true);
      updateViewFilter(views[0]!.id);
    }
  }, [views, hasSetInitialView, setHasSetInitialView, updateViewFilter]);

  return children;
}
