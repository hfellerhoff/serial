"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SendInviteDialog } from "~/components/admin/SendInviteDialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { orpc } from "~/lib/orpc";

type InviteDisplayStatus = "active" | "disabled" | "expired" | "exhausted";

const STATUS_VARIANTS: Record<
  InviteDisplayStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  disabled: "destructive",
  expired: "destructive",
  exhausted: "secondary",
};

const STATUS_LABELS: Record<InviteDisplayStatus, string> = {
  active: "Active",
  disabled: "Disabled",
  expired: "Expired",
  exhausted: "Used",
};

function getDisplayStatus(
  status: string,
  expiresAt: Date | null,
  maxUses: number | null,
  useCount: number,
): InviteDisplayStatus {
  if (status === "disabled") return "disabled";
  if (expiresAt && new Date(expiresAt) < new Date()) return "expired";
  if (maxUses !== null && useCount >= maxUses) return "exhausted";
  return "active";
}

function formatUseCount(maxUses: number | null, useCount: number): string {
  if (maxUses !== null) return `${useCount} / ${maxUses} uses`;
  if (useCount === 0) return "No uses yet";
  return `${useCount} ${useCount === 1 ? "use" : "uses"}`;
}

export function AdminInviteList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    orpc.admin.listInvitations.queryOptions(),
  );

  const deleteMutation = useMutation(
    orpc.admin.deleteInvitation.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.listInvitations.queryKey(),
        });
        toast.success("Invitation deleted");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete invitation");
      },
    }),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2Icon className="animate-spin" size={24} />
      </div>
    );
  }

  const invitations = data?.invitations ?? [];

  if (invitations.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No invitations yet
      </p>
    );
  }

  return (
    <div className="-mx-3 flex flex-col">
      {invitations.map((invite) => (
        <InviteRow
          key={invite.id}
          invite={invite}
          onDelete={() => deleteMutation.mutate({ invitationId: invite.id })}
          isDeleting={deleteMutation.isPending}
        />
      ))}
    </div>
  );
}

function InviteRow({
  invite,
  onDelete,
  isDeleting,
}: {
  invite: {
    id: string;
    inviteUrl: string;
    status: string;
    maxUses: number | null;
    expiresAt: Date | null;
    createdAt: Date;
    inviterName: string | null;
    useCount: number;
  };
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  const displayStatus = getDisplayStatus(
    invite.status,
    invite.expiresAt,
    invite.maxUses,
    invite.useCount,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-medium">
            {invite.expiresAt
              ? `Expires ${dayjs(invite.expiresAt).format("MMM D, YYYY")}`
              : "Never expires"}
          </span>
          <span className="text-muted-foreground text-sm">
            {formatUseCount(invite.maxUses, invite.useCount)}
            {" · Created "}
            {dayjs(invite.createdAt).format("MMM D, YYYY")}
            {invite.inviterName ? ` by ${invite.inviterName}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_VARIANTS[displayStatus]}>
            {STATUS_LABELS[displayStatus]}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy invite link"
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon size={16} className="text-muted-foreground" />
            ) : (
              <CopyIcon size={16} className="text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Send invite link"
            onClick={() => setSendDialogOpen(true)}
          >
            <SendIcon size={16} className="text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete invitation"
            disabled={isDeleting}
            onClick={onDelete}
          >
            <Trash2Icon size={16} className="text-muted-foreground" />
          </Button>
        </div>
      </div>
      <SendInviteDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        invitationId={invite.id}
      />
    </>
  );
}
