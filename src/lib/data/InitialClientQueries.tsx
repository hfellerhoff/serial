"use client";

import { useAtom } from "jotai";
import { useEffect } from "react";
import { hasSetInitialViewAtom } from "./atoms";
import { useContentCategoriesQuery } from "./content-categories";
import { useFeedsQuery } from "./feeds";
import { useUpdateViewFilter, useViews } from "./views";
import { useFetchFeedItems } from "./store";
import type { PropsWithChildren } from "react";

export function InitialClientQueries({ children }: PropsWithChildren) {
  const fetchFeedItems = useFetchFeedItems();

  useEffect(() => {
    void fetchFeedItems();
  }, []);

  useFeedsQuery();
  useContentCategoriesQuery();

  const [hasSetInitialView, setHasSetInitialView] = useAtom(
    hasSetInitialViewAtom,
  );
  const { views } = useViews();
  const updateViewFilter = useUpdateViewFilter();

  useEffect(() => {
    if (views.length > 0 && !hasSetInitialView) {
      setHasSetInitialView(true);
      updateViewFilter(views[0]!.id);
    }
  }, [views, hasSetInitialView, setHasSetInitialView, updateViewFilter]);

  return children;
}
