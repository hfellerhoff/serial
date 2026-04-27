"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { CalendarIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

interface EditInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitation: {
    id: string;
    name: string | null;
    maxUses: number | null;
    expiresAt: Date | null;
  };
}

function getInitialUsageMode(maxUses: number | null): UsageMode {
  if (maxUses === null) return "unlimited";
  if (maxUses === 1) return "one-time";
  return "custom";
}

function getInitialExpiryMode(expiresAt: Date | null): ExpiryMode {
  if (expiresAt === null) return "never";
  return "custom";
}

export function EditInviteDialog({
  open,
  onOpenChange,
  invitation,
}: EditInviteDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(invitation.name ?? "");
  const [usageMode, setUsageMode] = useState<UsageMode>(
    getInitialUsageMode(invitation.maxUses),
  );
  const [customUsesInput, setCustomUsesInput] = useState(
    invitation.maxUses !== null && invitation.maxUses !== 1
      ? String(invitation.maxUses)
      : "",
  );
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>(
    getInitialExpiryMode(invitation.expiresAt),
  );
  const [customExpiryDate, setCustomExpiryDate] = useState<Date | undefined>(
    invitation.expiresAt ?? undefined,
  );

  const nameRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  useEffect(() => {
    if (open) {
      setName(invitation.name ?? "");
      setUsageMode(getInitialUsageMode(invitation.maxUses));
      setCustomUsesInput(
        invitation.maxUses !== null && invitation.maxUses !== 1
          ? String(invitation.maxUses)
          : "",
      );
      setExpiryMode(getInitialExpiryMode(invitation.expiresAt));
      setCustomExpiryDate(invitation.expiresAt ?? undefined);
    }
  }, [open, invitation]);

  const updateMutation = useMutation(
    orpc.admin.updateInvitation.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.listInvitations.queryKey(),
        });
        toast.success("Invitation updated");
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update invitation");
      },
    }),
  );

  const parsedCustomUses = parseInt(customUsesInput, 10);
  const isCustomUsageValid = !isNaN(parsedCustomUses) && parsedCustomUses > 0;
  const isCustomExpiryValid =
    expiryMode !== "custom" || customExpiryDate !== undefined;
  const isSaveDisabled =
    updateMutation.isPending ||
    (usageMode === "custom" && !isCustomUsageValid) ||
    !isCustomExpiryValid;

  const handleSave = () => {
    let maxUses: number | null = null;
    if (usageMode === "one-time") {
      maxUses = 1;
    } else if (usageMode === "custom") {
      if (!isCustomUsageValid) return;
      maxUses = parsedCustomUses;
    }

    let expiresAt: Date | null = null;
    if (expiryMode === "custom" && customExpiryDate) {
      expiresAt = customExpiryDate;
    } else if (expiryMode === "day") {
      expiresAt = dayjs().add(1, "day").toDate();
    } else if (expiryMode === "week") {
      expiresAt = dayjs().add(1, "week").toDate();
    } else if (expiryMode === "month") {
      expiresAt = dayjs().add(1, "month").toDate();
    }

    updateMutation.mutate({
      invitationId: invitation.id,
      name: name.trim() || null,
      maxUses,
      expiresAt,
    });
  };

  const tomorrow = dayjs().add(1, "day").startOf("day").toDate();

  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Invite Link"
      description="Update the details for this invitation link."
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="edit-invite-name">Name (optional)</Label>
          <Input
            ref={nameRef}
            id="edit-invite-name"
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
              id="edit-custom-uses"
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
          disabled={isSaveDisabled}
          onClick={handleSave}
        >
          {updateMutation.isPending ? (
            <Loader2Icon size={16} className="animate-spin" />
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </ControlledResponsiveDialog>
  );
}
