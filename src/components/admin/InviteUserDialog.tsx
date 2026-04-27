"use client";

import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { CalendarIcon, CheckIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";
import { useSession } from "~/lib/auth-client";
import { orpc } from "~/lib/orpc";

type UsageMode = "one-time" | "unlimited" | "custom";

const USAGE_MODE_LABELS: Record<UsageMode, string> = {
  "one-time": "Once",
  unlimited: "Unlimited",
  custom: "Custom",
};

const USAGE_MODES: UsageMode[] = ["one-time", "unlimited", "custom"];

type ExpiryMode = "day" | "week" | "month" | "never" | "custom";

const EXPIRY_MODE_LABELS: Record<ExpiryMode, string> = {
  day: "One day",
  week: "One week",
  month: "One month",
  never: "Never",
  custom: "Custom",
};

const EXPIRY_MODES: ExpiryMode[] = ["day", "week", "month", "never", "custom"];

function getExpiryDate(
  mode: ExpiryMode,
  customDate: Date | undefined,
): Date | null {
  switch (mode) {
    case "day":
      return dayjs().add(1, "day").toDate();
    case "week":
      return dayjs().add(1, "week").toDate();
    case "month":
      return dayjs().add(1, "month").toDate();
    case "never":
      return null;
    case "custom":
      return customDate ?? dayjs().add(1, "week").toDate();
  }
}

export function InviteUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const { data: session } = useSession();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [usageMode, setUsageMode] = useState<UsageMode>("one-time");
  const [customUsesInput, setCustomUsesInput] = useState("");
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("week");
  const [customExpiryDate, setCustomExpiryDate] = useState<Date | undefined>(
    undefined,
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation(
    orpc.admin.createInvitation.mutationOptions({
      onSuccess: (result) => {
        setInviteUrl(result.inviteUrl);
        setInvitationId(result.id);
        onCreated?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create invitation");
      },
    }),
  );

  const sendMutation = useMutation(
    orpc.admin.sendInvitationEmail.mutationOptions({
      onSuccess: () => {
        toast.success("Invitation email sent!");
        setEmail("");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to send invitation email");
      },
    }),
  );

  const handleClose = (value: boolean) => {
    onOpenChange(value);
    if (!value) {
      setInviteUrl(null);
      setInvitationId(null);
      setName("");
      setUsageMode("one-time");
      setCustomUsesInput("");
      setExpiryMode("week");
      setCustomExpiryDate(undefined);
      setEmail("");
      setCopied(false);
    }
  };

  const parsedCustomUses = parseInt(customUsesInput, 10);
  const isCustomUsageValid = !isNaN(parsedCustomUses) && parsedCustomUses > 0;
  const isCustomExpiryValid =
    expiryMode !== "custom" || customExpiryDate !== undefined;
  const isCreateDisabled =
    createMutation.isPending ||
    (usageMode === "custom" && !isCustomUsageValid) ||
    !isCustomExpiryValid;

  const handleCreate = () => {
    let maxUses: number | null = null;
    if (usageMode === "one-time") {
      maxUses = 1;
    } else if (usageMode === "custom") {
      if (!isCustomUsageValid) return;
      maxUses = parsedCustomUses;
    }

    const expiresAt = getExpiryDate(expiryMode, customExpiryDate);
    createMutation.mutate({
      name: name.trim() || null,
      maxUses,
      expiresAt: expiresAt ?? null,
    });
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const tomorrow = dayjs().add(1, "day").startOf("day").toDate();

  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={handleClose}
      title="Create Invite Link"
      description="Create a sign-up link to share with new users."
    >
      {!inviteUrl ? (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-name">Name (optional)</Label>
            <Input
              id="invite-name"
              type="text"
              placeholder="Jane Doe, my friends, etc."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Max uses</Label>
            <ToggleGroup
              type="single"
              value={usageMode}
              onValueChange={(value) => {
                if (!value) return;
                setUsageMode(value as UsageMode);
              }}
              size="sm"
              rovingFocus={false}
              className="justify-start"
            >
              {USAGE_MODES.map((mode) => (
                <ToggleGroupItem key={mode} value={mode}>
                  {USAGE_MODE_LABELS[mode]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {usageMode === "custom" && (
              <Input
                id="custom-uses"
                type="number"
                min="1"
                placeholder="Number of uses"
                value={customUsesInput}
                onChange={(e) => setCustomUsesInput(e.target.value)}
              />
            )}
          </div>
          <div className="grid gap-2">
            <Label>Expires after</Label>
            <ToggleGroup
              type="single"
              value={expiryMode}
              onValueChange={(value) => {
                if (!value) return;
                setExpiryMode(value as ExpiryMode);
              }}
              size="sm"
              rovingFocus={false}
              className="justify-start"
            >
              {EXPIRY_MODES.map((mode) => (
                <ToggleGroupItem key={mode} value={mode}>
                  {EXPIRY_MODE_LABELS[mode]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {expiryMode === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start gap-2 text-left font-normal",
                      !customExpiryDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon size={16} />
                    {customExpiryDate ? (
                      dayjs(customExpiryDate).format("MMMM D, YYYY")
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customExpiryDate}
                    onSelect={setCustomExpiryDate}
                    disabled={{ before: tomorrow }}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
          <Button
            className="w-full"
            disabled={isCreateDisabled}
            onClick={handleCreate}
          >
            {createMutation.isPending ? (
              <Loader2Icon size={16} className="animate-spin" />
            ) : (
              "Create invite link"
            )}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Invite link</Label>
            <div className="flex min-w-0 items-center gap-2">
              <code className="bg-muted/50 block min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-xs">
                {inviteUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy invite link"
                onClick={handleCopy}
              >
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <Label htmlFor="invite-email" className="mb-2 block">
              Send via email (optional)
            </Label>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                disabled={!email || sendMutation.isPending || !invitationId}
                onClick={() =>
                  sendMutation.mutate({
                    invitationId: invitationId!,
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
              Your name &ldquo;{session?.user.name}&rdquo; will be included in
              the email.
            </p>
          </div>
        </div>
      )}
    </ControlledResponsiveDialog>
  );
}
