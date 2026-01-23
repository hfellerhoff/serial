"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { orpc } from "~/lib/orpc";

export function PublicSignupToggle() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    orpc.admin.getPublicSignupSetting.queryOptions(),
  );

  const mutation = useMutation(
    orpc.admin.setPublicSignupSetting.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.getPublicSignupSetting.queryKey(),
        });
        toast.success(
          result.enabled
            ? "Public sign ups enabled"
            : "Public sign ups disabled",
        );
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update setting");
      },
    }),
  );

  const handleToggle = (checked: boolean) => {
    mutation.mutate({ enabled: checked });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <Loader2Icon className="animate-spin" size={16} />
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="public-signup-toggle" className="font-medium">
          Allow public sign up
        </Label>
        <span className="text-muted-foreground text-sm">
          {data?.enabled
            ? "Anyone can create an account"
            : "Only admins can create accounts"}
        </span>
      </div>
      <Switch
        id="public-signup-toggle"
        checked={data?.enabled ?? false}
        onCheckedChange={handleToggle}
        disabled={mutation.isPending}
      />
    </div>
  );
}
