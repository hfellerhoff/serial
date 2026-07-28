"use client";

import { useMutation } from "@tanstack/react-query";
import {
  BanIcon,
  KeyRoundIcon,
  Loader2Icon,
  UserCheckIcon,
  UserIcon,
} from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { orpc } from "~/lib/orpc";

interface AdminUserActionsProps {
  userId: string;
  isBanned: boolean;
  isCurrentUser?: boolean;
}

export function AdminUserActions({
  userId,
  isBanned,
  isCurrentUser,
}: AdminUserActionsProps) {
  const router = useRouter();

  const banMutation = useMutation(
    orpc.admin.banUser.mutationOptions({
      onSuccess: async () => {
        await router.invalidate();
        toast.success("User banned");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to ban user");
      },
    }),
  );

  const unbanMutation = useMutation(
    orpc.admin.unbanUser.mutationOptions({
      onSuccess: async () => {
        await router.invalidate();
        toast.success("User unbanned");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to unban user");
      },
    }),
  );

  const revokeSessionsMutation = useMutation(
    orpc.admin.revokeUserSessions.mutationOptions({
      onSuccess: async () => {
        await router.invalidate();
        toast.success("All sessions revoked");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to revoke sessions");
      },
    }),
  );

  const impersonateMutation = useMutation(
    orpc.admin.impersonateUser.mutationOptions({
      onSuccess: () => {
        toast.success("Impersonating user");
        router.navigate({ to: "/" });
        window.location.reload();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to impersonate user");
      },
    }),
  );

  const isPending =
    banMutation.isPending ||
    unbanMutation.isPending ||
    revokeSessionsMutation.isPending ||
    impersonateMutation.isPending;

  return (
    <div className="flex flex-wrap gap-2">
      {isBanned ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => unbanMutation.mutate({ userId })}
          disabled={isPending}
        >
          {unbanMutation.isPending ? (
            <Loader2Icon className="mr-1.5 animate-spin" size={14} />
          ) : (
            <UserCheckIcon className="mr-1.5" size={14} />
          )}
          Unban
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => banMutation.mutate({ userId })}
          disabled={isPending || isCurrentUser}
        >
          {banMutation.isPending ? (
            <Loader2Icon className="mr-1.5 animate-spin" size={14} />
          ) : (
            <BanIcon className="mr-1.5" size={14} />
          )}
          Ban
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => revokeSessionsMutation.mutate({ userId })}
        disabled={isPending}
      >
        {revokeSessionsMutation.isPending ? (
          <Loader2Icon className="mr-1.5 animate-spin" size={14} />
        ) : (
          <KeyRoundIcon className="mr-1.5" size={14} />
        )}
        Revoke Sessions
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => impersonateMutation.mutate({ userId })}
        disabled={isPending || isCurrentUser}
      >
        {impersonateMutation.isPending ? (
          <Loader2Icon className="mr-1.5 animate-spin" size={14} />
        ) : (
          <UserIcon className="mr-1.5" size={14} />
        )}
        Impersonate
      </Button>
    </div>
  );
}
