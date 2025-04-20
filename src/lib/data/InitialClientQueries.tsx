"use client";

import { useEffect, useRef, type PropsWithChildren } from "react";
import { useFeedsQuery } from "./feeds";
import { useFeedItemsQuery } from "./feed-items";
import { useUpdateViewFilter, useViews, useViewsQuery } from "./views";
import { useContentCategoriesQuery } from "./content-categories";
import { useAtom } from "jotai";
import { hasSetInitialViewAtom } from "./atoms";

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
