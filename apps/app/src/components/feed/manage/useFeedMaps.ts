import { useMemo } from "react";
import type { ManagedFeeds } from "./useBulkFeedEditing";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useViewFeeds } from "~/lib/data/view-feeds";
import { useViews } from "~/lib/data/views";
import { UNCATEGORIZED_VIEW_ID } from "~/lib/data/views/constants";

export function useFeedMaps() {
  const { feedCategories } = useFeedCategories();
  const { contentCategories } = useContentCategories();
  const { views } = useViews();
  const { viewFeeds } = useViewFeeds();

  const feedCategoriesMap = useMemo(() => {
    const map = new Map<number, number[]>();
    feedCategories.forEach((fc) => {
      const existing = map.get(fc.feedId) ?? [];
      existing.push(fc.categoryId);
      map.set(fc.feedId, existing);
    });
    return map;
  }, [feedCategories]);

  const feedViewsMap = useMemo(() => {
    const map = new Map<number, number[]>();
    viewFeeds.forEach((vf) => {
      const existing = map.get(vf.feedId) ?? [];
      existing.push(vf.viewId);
      map.set(vf.feedId, existing);
    });
    return map;
  }, [viewFeeds]);

  const categoryNamesMap = useMemo(() => {
    const map = new Map<number, string>();
    contentCategories.forEach((c) => {
      map.set(c.id, c.name);
    });
    return map;
  }, [contentCategories]);

  const viewNamesMap = useMemo(() => {
    const map = new Map<number, string>();
    views
      .filter((v) => v.id !== UNCATEGORIZED_VIEW_ID)
      .forEach((v) => {
        map.set(v.id, v.name);
      });
    return map;
  }, [views]);

  const customViewOptions = useMemo(() => {
    return views
      .filter((v) => v.id !== UNCATEGORIZED_VIEW_ID)
      .map((v) => ({ id: v.id, label: v.name }));
  }, [views]);

  return {
    feedCategoriesMap,
    feedViewsMap,
    categoryNamesMap,
    viewNamesMap,
    customViewOptions,
  };
}

export function filterFeeds(
  feeds: ManagedFeeds,
  searchQuery: string,
  maps: {
    feedCategoriesMap: Map<number, number[]>;
    feedViewsMap: Map<number, number[]>;
    categoryNamesMap: Map<number, string>;
    viewNamesMap: Map<number, string>;
  },
) {
  const { feedCategoriesMap, feedViewsMap, categoryNamesMap, viewNamesMap } =
    maps;
  const sorted = [...feeds].sort((a, b) => a.name.localeCompare(b.name));
  if (!searchQuery.trim()) return sorted;

  const lowercaseQuery = searchQuery.toLowerCase();
  const matches = (name: string | undefined) =>
    !!name && name.toLowerCase().includes(lowercaseQuery);

  return sorted.filter((feed) => {
    if (matches(feed.name)) return true;

    const categoryIds = feedCategoriesMap.get(feed.id);
    if (categoryIds?.some((id) => matches(categoryNamesMap.get(id)))) {
      return true;
    }

    const viewIds = feedViewsMap.get(feed.id);
    if (viewIds?.some((id) => matches(viewNamesMap.get(id)))) {
      return true;
    }

    return false;
  });
}

export function sortIdsByName(ids: number[], namesMap: Map<number, string>) {
  return ids
    .slice()
    .sort((a, b) =>
      (namesMap.get(a) ?? "").localeCompare(namesMap.get(b) ?? ""),
    );
}
