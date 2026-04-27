"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { KeyboardShortcutDisplay } from "~/components/ButtonWithShortcut";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useShortcut } from "~/lib/hooks/useShortcut";

type AdminTab = "settings" | "users" | "invites" | "stats";

const TAB_ROUTES: Record<
  AdminTab,
  "/admin/settings" | "/admin/users" | "/admin/invites" | "/admin/stats"
> = {
  settings: "/admin/settings",
  users: "/admin/users",
  invites: "/admin/invites",
  stats: "/admin/stats",
};

export function AdminTabs({ value }: { value: AdminTab }) {
  const navigate = useNavigate();

  const goTo = useCallback(
    (tab: AdminTab) => {
      void navigate({ to: TAB_ROUTES[tab] });
    },
    [navigate],
  );

  useShortcut("1", () => goTo("settings"));
  useShortcut("2", () => goTo("stats"));
  useShortcut("3", () => goTo("users"));
  useShortcut("4", () => goTo("invites"));

  return (
    <Tabs value={value}>
      <TabsList variant="pill">
        <TabsTrigger value="settings" asChild>
          <Link to="/admin/settings" className="relative">
            Settings
            <KeyboardShortcutDisplay shortcut="1" />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="stats" asChild>
          <Link to="/admin/stats" className="relative">
            Stats
            <KeyboardShortcutDisplay shortcut="2" />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="users" asChild>
          <Link to="/admin/users" className="relative">
            Users
            <KeyboardShortcutDisplay shortcut="3" />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="invites" asChild>
          <Link to="/admin/invites" className="relative">
            Invites
            <KeyboardShortcutDisplay shortcut="4" />
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
