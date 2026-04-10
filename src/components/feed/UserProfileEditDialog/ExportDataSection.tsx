"use client";

import { DownloadIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { CardRadioOption } from "~/components/ui/card-radio-group";
import type { OPMLFeedItem, OPMLGroup } from "~/lib/data/export/buildOPML";
import type { ApplicationFeed } from "~/server/db/schema";
import { Button } from "~/components/ui/button";
import { CardRadioGroup } from "~/components/ui/card-radio-group";
import { useContentCategories } from "~/lib/data/content-categories";
import { buildOPML } from "~/lib/data/export/buildOPML";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { isFeedCompatibleWithContentType } from "~/lib/data/feed-items/filters";
import { useFeeds } from "~/lib/data/feeds";
import { useViewFeeds } from "~/lib/data/view-feeds";
import { useViews } from "~/lib/data/views";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";

type GroupingMode = "view" | "tag";

const GROUPING_OPTIONS: Array<CardRadioOption<GroupingMode>> = [
  {
    value: "view",
    title: "Group by View",
    description: "Each of your views becomes a folder in the OPML file.",
  },
  {
    value: "tag",
    title: "Group by Tag",
    description: "Each of your tags becomes a folder in the OPML file.",
  },
];

function feedToOPMLItem(feed: ApplicationFeed): OPMLFeedItem {
  return {
    title: feed.name || feed.url,
    xmlUrl: feed.url,
  };
}

function downloadOPML(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportDataSection() {
  const [grouping, setGrouping] = useState<GroupingMode>("view");
  const [isExporting, setIsExporting] = useState(false);

  const { feeds } = useFeeds();
  const { views } = useViews();
  const { contentCategories } = useContentCategories();
  const { feedCategories } = useFeedCategories();
  const { viewFeeds } = useViewFeeds();

  const feedsById = useMemo(() => {
    const map = new Map<number, ApplicationFeed>();
    feeds.forEach((f) => map.set(f.id, f));
    return map;
  }, [feeds]);

  const buildExport = () => {
    if (grouping === "view") {
      return buildExportByView();
    }
    return buildExportByTag();
  };

  const buildExportByView = () => {
    const customViews = views.filter((v) => v.id !== INBOX_VIEW_ID);
    const groups: OPMLGroup[] = [];
    const groupedFeedIds = new Set<number>();

    // Pre-build view -> Set<feedId> map
    for (const view of customViews) {
      const feedIdsInView = new Set<number>();

      // Direct view-feed assignments
      for (const vf of viewFeeds) {
        if (vf.viewId === view.id) {
          feedIdsInView.add(vf.feedId);
        }
      }

      // Feeds via the view's categories
      if (view.categoryIds.length > 0) {
        const categorySet = new Set(view.categoryIds);
        for (const fc of feedCategories) {
          if (categorySet.has(fc.categoryId)) {
            feedIdsInView.add(fc.feedId);
          }
        }
      }

      // Filter by content type compatibility (matches view filtering semantics)
      const items: OPMLFeedItem[] = [];
      for (const feedId of feedIdsInView) {
        const feed = feedsById.get(feedId);
        if (!feed) continue;
        if (!isFeedCompatibleWithContentType(feed.platform, view.contentType)) {
          continue;
        }
        items.push(feedToOPMLItem(feed));
        groupedFeedIds.add(feedId);
      }

      if (items.length > 0) {
        items.sort((a, b) => a.title.localeCompare(b.title));
        groups.push({ name: view.name, feeds: items });
      }
    }

    // Sort groups by name
    groups.sort((a, b) => a.name.localeCompare(b.name));

    // Ungrouped feeds: not in any custom view
    const ungroupedFeeds: OPMLFeedItem[] = feeds
      .filter((f) => !groupedFeedIds.has(f.id))
      .map(feedToOPMLItem)
      .sort((a, b) => a.title.localeCompare(b.title));

    return buildOPML({ groups, ungroupedFeeds });
  };

  const buildExportByTag = () => {
    const groups: OPMLGroup[] = [];
    const groupedFeedIds = new Set<number>();

    for (const tag of contentCategories) {
      const items: OPMLFeedItem[] = [];
      for (const fc of feedCategories) {
        if (fc.categoryId !== tag.id) continue;
        const feed = feedsById.get(fc.feedId);
        if (!feed) continue;
        items.push(feedToOPMLItem(feed));
        groupedFeedIds.add(feed.id);
      }
      if (items.length > 0) {
        items.sort((a, b) => a.title.localeCompare(b.title));
        groups.push({ name: tag.name, feeds: items });
      }
    }

    groups.sort((a, b) => a.name.localeCompare(b.name));

    const ungroupedFeeds: OPMLFeedItem[] = feeds
      .filter((f) => !groupedFeedIds.has(f.id))
      .map(feedToOPMLItem)
      .sort((a, b) => a.title.localeCompare(b.title));

    return buildOPML({ groups, ungroupedFeeds });
  };

  const handleExport = () => {
    setIsExporting(true);
    try {
      const opml = buildExport();
      downloadOPML(opml, "serial-feeds.opml");
      toast.success("Exported feeds!");
    } catch {
      toast.error("Failed to export feeds.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid gap-4">
      <CardRadioGroup
        value={grouping}
        onValueChange={setGrouping}
        options={GROUPING_OPTIONS}
      />
      <Button
        onClick={handleExport}
        disabled={isExporting || feeds.length === 0}
      >
        <DownloadIcon size={16} />
        <span className="pl-1.5">
          {isExporting ? "Exporting..." : "Export OPML"}
        </span>
      </Button>
    </div>
  );
}
