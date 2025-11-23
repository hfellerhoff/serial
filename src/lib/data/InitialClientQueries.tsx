"use client";

import { useAtom } from "jotai";
import { useEffect, type PropsWithChildren } from "react";
import { hasSetInitialViewAtom } from "./atoms";
import { useContentCategoriesQuery } from "./content-categories";
import { useFeedsQuery } from "./feeds";
import { useUpdateViewFilter, useViews } from "./views";
import { useFeedItemsStore } from "./store";

export function InitialClientQueries({ children }: PropsWithChildren) {
  const fetchFeedItems = useFeedItemsStore(
    (store) => store.fetchItemsAction.fetch,
  );

  useEffect(() => {
    fetchFeedItems();
  }, []);

  useFeedsQuery();
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
