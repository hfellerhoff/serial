"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { KeyboardShortcutDisplay } from "~/components/ButtonWithShortcut";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useShortcut } from "~/lib/hooks/useShortcut";

type FeedManagementTab = "feeds" | "views" | "tags";

const TAB_ROUTES: Record<FeedManagementTab, "/feeds" | "/views" | "/tags"> = {
  feeds: "/feeds",
  views: "/views",
  tags: "/tags",
};

export function FeedManagementTabs({ value }: { value: FeedManagementTab }) {
  const navigate = useNavigate();

  const goTo = useCallback(
    (tab: FeedManagementTab) => {
      void navigate({ to: TAB_ROUTES[tab] });
    },
    [navigate],
  );

  useShortcut("1", () => goTo("feeds"));
  useShortcut("2", () => goTo("views"));
  useShortcut("3", () => goTo("tags"));

  return (
    <Tabs value={value}>
      <TabsList variant="pill">
        <TabsTrigger value="feeds" asChild>
          <Link to="/feeds" className="relative">
            Feeds
            <KeyboardShortcutDisplay shortcut="1" />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="views" asChild>
          <Link to="/views" className="relative">
            Views
            <KeyboardShortcutDisplay shortcut="2" />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="tags" asChild>
          <Link to="/tags" className="relative">
            Tags
            <KeyboardShortcutDisplay shortcut="3" />
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
