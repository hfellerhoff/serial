"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { EllipsisVerticalIcon, Loader2Icon, PlugIcon } from "lucide-react";
import { useState } from "react";
import { useDialogStore } from "./dialogStore";
import { Button } from "~/components/ui/button";
import { DropdownMenuSeparator } from "~/components/ui/dropdown-menu";
import {
  ResponsiveDropdown,
  ResponsiveDropdownLabel,
  ResponsiveDropdownMenuItem,
} from "~/components/ui/responsive-dropdown";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { authClient, signOut } from "~/lib/auth-client";
import { useClearAllUserData } from "~/lib/data/atoms";

export function UserManagementNavItem() {
  const {
    data,
    isPending, // loading state
  } = authClient.useSession();

  const { launchDialog } = useDialogStore();

  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const queryClient = useQueryClient();
  const clearAllUserData = useClearAllUserData();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <ResponsiveDropdown
          side="right"
          trigger={
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {isPending && <Loader2Icon className="animate-spin" size={32} />}
              {!isPending && (
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {" "}
                    {data?.user.name || "Account"}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {data?.user.email}
                  </span>
                </div>
              )}
              <EllipsisVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          }
        >
          <ResponsiveDropdownLabel className="p-0 font-normal">
            <div className="flex flex-col items-center justify-center pb-4">
              <h2 className="text-sm font-semibold">
                {data?.user.name || "Serial User"}
              </h2>
              <p className="text-muted-foreground text-xs">
                {data?.user.email}
              </p>
              <Link
                to="/debug"
                className="text-muted-foreground hover:text-foreground pt-1 text-xs underline"
              >
                View debug
              </Link>
            </div>
          </ResponsiveDropdownLabel>
          <ResponsiveDropdownMenuItem asChild>
            <Button
              variant="outline"
              className="mb-2 w-full"
              onClick={() => {
                launchDialog("connections");
              }}
            >
              <PlugIcon size={16} />
              <span className="pl-1.5">Connections</span>
            </Button>
          </ResponsiveDropdownMenuItem>
          <div className="my-4">
            <DropdownMenuSeparator />
          </div>
          <ResponsiveDropdownMenuItem asChild>
            <Button
              variant="outline"
              className="mb-2 w-full"
              onClick={async () => {
                launchDialog("edit-user-profile");
              }}
            >
              Edit Profile
            </Button>
          </ResponsiveDropdownMenuItem>
          <ResponsiveDropdownMenuItem asChild>
            <Button
              className="w-full"
              onClick={async () => {
                await signOut({
                  fetchOptions: {
                    onRequest: () => {
                      setIsSigningOut(true);
                    },
                    onSuccess: () => {
                      queryClient.clear();
                      clearAllUserData();
                      void router.navigate({ to: "/auth/sign-in" });
                    },
                  },
                });
              }}
            >
              {isSigningOut ? (
                <Loader2Icon className="animate-spin" size={16} />
              ) : (
                "Sign Out"
              )}
            </Button>
          </ResponsiveDropdownMenuItem>
        </ResponsiveDropdown>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
