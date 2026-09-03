"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import {
  CreditCardIcon,
  EllipsisVerticalIcon,
  Loader2Icon,
  PlugIcon,
} from "lucide-react";
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
import { isAtprotoPlaceholderEmail } from "~/lib/auth/atproto";
import { clearUserDataAfterSignOut } from "~/lib/auth/sign-out-cleanup";
import { useClearAllUserData } from "~/lib/data/atoms";
import { useSubscription } from "~/lib/data/subscription";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

function AccountTriggerContent({
  isPending,
  name,
  displayEmail,
}: {
  isPending: boolean;
  name: string | undefined;
  displayEmail: string | undefined;
}) {
  return (
    <>
      {isPending && <Loader2Icon className="animate-spin" size={32} />}
      {!isPending && (
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium"> {name || "Account"}</span>
          {!IS_DEMO_INSTANCE && displayEmail && (
            <span className="text-muted-foreground truncate text-xs">
              {displayEmail}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function AccountDropdownHeader({
  name,
  displayEmail,
  billingEnabled,
  planName,
}: {
  name: string | undefined;
  displayEmail: string | undefined;
  billingEnabled: boolean;
  planName: ReturnType<typeof useSubscription>["planName"];
}) {
  return (
    <ResponsiveDropdownLabel className="p-0 font-normal">
      <div className="flex flex-col items-center justify-center pb-4">
        <h2 className="text-sm font-semibold">{name || "Serial User"}</h2>
        {!IS_DEMO_INSTANCE && displayEmail && (
          <p className="text-muted-foreground text-xs">{displayEmail}</p>
        )}
        {billingEnabled && (
          <p className="text-muted-foreground text-xs">{planName} plan</p>
        )}
        <Link
          to="/debug"
          className="text-muted-foreground hover:text-foreground pt-1 text-xs underline"
        >
          View debug
        </Link>
      </div>
    </ResponsiveDropdownLabel>
  );
}

function AccountMenuItems({ billingEnabled }: { billingEnabled: boolean }) {
  const { launchDialog } = useDialogStore();

  return (
    <>
      {!IS_DEMO_INSTANCE && (
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
      )}
      {billingEnabled && (
        <ResponsiveDropdownMenuItem asChild>
          <Button
            variant="outline"
            className="mb-2 w-full"
            onClick={() => launchDialog("subscription")}
          >
            <CreditCardIcon size={16} />
            <span className="pl-1.5">Subscription</span>
          </Button>
        </ResponsiveDropdownMenuItem>
      )}
      {!IS_DEMO_INSTANCE && (
        <div className="my-4">
          <DropdownMenuSeparator />
        </div>
      )}
      <ResponsiveDropdownMenuItem asChild>
        <Button
          variant="outline"
          className="mb-2 w-full"
          onClick={async () => {
            launchDialog("edit-user-profile");
          }}
        >
          Settings
        </Button>
      </ResponsiveDropdownMenuItem>
    </>
  );
}

function SignOutMenuItem() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const queryClient = useQueryClient();
  const clearAllUserData = useClearAllUserData();

  return (
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
                clearUserDataAfterSignOut({
                  clearQueryCache: () => queryClient.clear(),
                  clearPersistedUserData: clearAllUserData,
                  localStorage: window.localStorage,
                });
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
  );
}

export function UserManagementNavItem() {
  const {
    data,
    isPending, // loading state
  } = authClient.useSession();

  const { billingEnabled, planName } = useSubscription();

  // A DID-only user carries an internal placeholder address; treat it as
  // having no email rather than surfacing the garbled value.
  const email = data?.user.email;
  const displayEmail =
    email && !isAtprotoPlaceholderEmail(email) ? email : undefined;

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
              <AccountTriggerContent
                isPending={isPending}
                name={data?.user.name}
                displayEmail={displayEmail}
              />
              <EllipsisVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          }
        >
          <AccountDropdownHeader
            name={data?.user.name}
            displayEmail={displayEmail}
            billingEnabled={billingEnabled}
            planName={planName}
          />
          <AccountMenuItems billingEnabled={billingEnabled} />
          <SignOutMenuItem />
        </ResponsiveDropdown>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
