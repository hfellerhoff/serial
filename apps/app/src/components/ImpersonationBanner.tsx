"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2Icon, UserIcon, XIcon } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { useSession } from "~/lib/auth-client";
import { orpc } from "~/lib/orpc";

export function ImpersonationBanner() {
  const { data: session } = useSession();
  const router = useRouter();

  const stopImpersonating = useMutation(
    orpc.admin.stopImpersonating.mutationOptions({
      onSuccess: () => {
        toast.success("Stopped impersonating");
        void router.navigate({ to: "/admin", reloadDocument: true });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to stop impersonating");
      },
    }),
  );

  // Check if current session is impersonated
  const isImpersonated = !!session?.session.impersonatedBy;

  if (!isImpersonated) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-amber-950">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserIcon size={16} />
          <span>
            You are impersonating{" "}
            <strong>{session.user.name || session.user.email}</strong>
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-950 hover:bg-amber-600 hover:text-amber-950"
          onClick={() => stopImpersonating.mutate(undefined)}
          disabled={stopImpersonating.isPending}
        >
          {stopImpersonating.isPending ? (
            <Loader2Icon className="mr-1.5 animate-spin" size={14} />
          ) : (
            <XIcon className="mr-1.5" size={14} />
          )}
          Stop Impersonating
        </Button>
      </div>
    </div>
  );
}
