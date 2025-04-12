"use client";

import { Loader2Icon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { authClient, signOut } from "~/lib/auth-client";
import { AUTH_SIGNED_OUT_URL } from "~/server/auth/constants";

export function UserManagementPopoverButton() {
  const {
    data,
    isPending, //loading state
  } = authClient.useSession();

  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          disabled={isPending}
          size={isPending ? "icon" : "icon md:default"}
          variant="outline"
        >
          {isPending ? (
            <Loader2Icon className="animate-spin" size={16} />
          ) : (
            <UserIcon size={16} />
          )}
          {!isPending && (
            <span className="hidden md:block">
              {data?.user.name || "Account"}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col items-center justify-center pb-4">
          <h2 className="text-sm font-semibold">
            {data?.user.name || "Serial User"}
          </h2>
          <p className="text-muted-foreground text-xs">{data?.user.email}</p>
        </div>
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
      </PopoverContent>
    </Popover>
  );
}
