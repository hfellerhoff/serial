"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { orpc } from "~/lib/orpc";

export function SignupNotificationSetting() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    orpc.admin.getSignupNotificationSetting.queryOptions(),
  );

  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const email = emailOverride ?? data?.email ?? "";

  const mutation = useMutation(
    orpc.admin.setSignupNotificationSetting.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.getSignupNotificationSetting.queryKey(),
        });
        setEmailOverride(null);
        toast.success(
          result.enabled
            ? "Signup notifications enabled"
            : "Signup notifications disabled",
        );
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update notification setting");
      },
    }),
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <Loader2Icon className="animate-spin" size={16} />
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  const enabled = data?.enabled ?? false;

  const handleToggle = (checked: boolean) => {
    mutation.mutate({
      enabled: checked,
      email: email || undefined,
    });
  };

  const handleSaveEmail = () => {
    mutation.mutate({
      enabled,
      email: email || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <span className="text-muted-foreground text-xs">Notifications</span>

      <div className="flex items-center justify-between">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="notify-signup-toggle" className="font-medium">
            Email on new sign-up
          </Label>
          <span className="text-muted-foreground text-sm">
            {enabled
              ? "An email is sent when a new user signs up"
              : "No notifications are sent on sign-up"}
          </span>
        </div>
        <Switch
          id="notify-signup-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={mutation.isPending}
        />
      </div>

      {enabled && (
        <div className="flex gap-2 border-t pt-3">
          <Input
            id="notify-email"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmailOverride(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!email || emailOverride === null || mutation.isPending}
            onClick={handleSaveEmail}
          >
            {mutation.isPending ? (
              <Loader2Icon size={14} className="animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
