"use client";

import { Loader2Icon, ExpandIcon, EllipsisVerticalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  ResponsiveDropdown,
  ResponsiveDropdownLabel,
  ResponsiveDropdownMenuItem,
} from "~/components/ui/responsive-dropdown";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";
import { authClient, signOut } from "~/lib/auth-client";
import { AUTH_SIGNED_OUT_URL } from "~/server/auth/constants";

export function UserManagementNavItem() {
  const {
    data,
    isPending, //loading state
  } = authClient.useSession();

  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { isMobile } = useSidebar();

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
            </div>
          </ResponsiveDropdownLabel>
          <ResponsiveDropdownMenuItem asChild>
            <Button
              className="w-full"
              onClick={async () => {
                await signOut({
                  fetchOptions: {
                    onRequest: () => {
                      setIsSigningOut(true);
                    },
                    onSuccess: async () => {
                      router.push(AUTH_SIGNED_OUT_URL);
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
