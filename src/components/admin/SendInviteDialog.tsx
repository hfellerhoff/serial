"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { useSession } from "~/lib/auth-client";
import { orpc } from "~/lib/orpc";

export function SendInviteDialog({
  open,
  onOpenChange,
  invitationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitationId: string;
}) {
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const inputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  const sendMutation = useMutation(
    orpc.admin.sendInvitationEmail.mutationOptions({
      onSuccess: () => {
        toast.success("Invitation email sent!");
        setEmail("");
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to send invitation email");
      },
    }),
  );

  const handleClose = (value: boolean) => {
    onOpenChange(value);
    if (!value) {
      setEmail("");
    }
  };

  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={handleClose}
      title="Send Invite Link"
      description="Send this invitation link to a user via email."
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="send-invite-email">Email address</Label>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              id="send-invite-email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              disabled={!email || sendMutation.isPending}
              onClick={() =>
                sendMutation.mutate({
                  invitationId,
                  email,
                })
              }
            >
              {sendMutation.isPending ? (
                <Loader2Icon size={16} className="animate-spin" />
              ) : (
                "Send"
              )}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Your name &ldquo;{session?.user.name}&rdquo; will be included in the
            email.
          </p>
        </div>
      </div>
    </ControlledResponsiveDialog>
  );
}
