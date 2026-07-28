"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { AuthProvider } from "~/lib/constants";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { orpc } from "~/lib/orpc";

function ProviderToggle({
  id,
  label,
  checked,
  disabled,
  lockedTooltip,
  isPending,
  onToggle,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  lockedTooltip?: string;
  isPending: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const isLocked = !!lockedTooltip;
  const isDisabled = disabled || isPending;

  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className={isDisabled ? "text-muted-foreground" : ""}>
        {label}
      </Label>
      {isLocked ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-5 w-9 items-center justify-center">
              <CheckIcon size={16} className="text-muted-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent>{lockedTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onToggle}
          disabled={isDisabled}
        />
      )}
    </div>
  );
}

export function PublicSignupToggle() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    orpc.admin.getPublicSignupSetting.queryOptions(),
  );

  const signupMutation = useMutation(
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

  const signinMutation = useMutation(
    orpc.admin.setEnabledSigninProviders.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.getPublicSignupSetting.queryKey(),
        });
        toast.success("Sign-in methods updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update sign-in methods");
      },
    }),
  );

  const signupProvidersMutation = useMutation(
    orpc.admin.setEnabledSignupProviders.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.getPublicSignupSetting.queryKey(),
        });
        toast.success("Sign-up methods updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update sign-up methods");
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

  const globalEnabled = data?.enabled ?? false;
  const signinProviders = data?.signinProviders ?? ["email"];
  const signupProviders = data?.signupProviders ?? ["email"];
  const oauthConfigured = data?.isOAuthConfigured ?? false;
  const oauthProviderName = data?.oauthProviderName ?? "OAuth";
  const adminSigninMethods = data?.adminSigninMethods ?? ["email"];

  const toggleSignin = (provider: AuthProvider, checked: boolean) => {
    const next = checked
      ? [...signinProviders, provider]
      : signinProviders.filter((p) => p !== provider);
    signinMutation.mutate({ providers: next });
  };

  const toggleSignup = (provider: AuthProvider, checked: boolean) => {
    const next = checked
      ? [...signupProviders, provider]
      : signupProviders.filter((p) => p !== provider);
    signupProvidersMutation.mutate({
      providers: next,
    });
  };

  const getSigninLockedTooltip = (provider: AuthProvider) => {
    if (adminSigninMethods.includes(provider)) {
      return "An admin is using this method, so it cannot be disabled";
    }
    return undefined;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <span className="text-muted-foreground text-xs">Sign-up methods</span>

        {globalEnabled && (
          <>
            <ProviderToggle
              id="signup-email-toggle"
              label="Email"
              checked={signupProviders.includes("email")}
              onToggle={(checked) => toggleSignup("email", checked)}
              isPending={signupProvidersMutation.isPending}
            />

            {oauthConfigured && (
              <ProviderToggle
                id="signup-oauth-toggle"
                label={oauthProviderName}
                checked={signupProviders.includes("oauth")}
                onToggle={(checked) => toggleSignup("oauth", checked)}
                isPending={signupProvidersMutation.isPending}
              />
            )}
          </>
        )}

        <div
          className={`flex items-center justify-between ${globalEnabled ? "mt-2 border-t pt-4" : ""}`}
        >
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="public-signup-toggle" className="font-medium">
              Allow public sign up
            </Label>
            <span className="text-muted-foreground text-sm">
              {globalEnabled
                ? "Anyone can create an account"
                : "Only admins can create accounts"}
            </span>
          </div>
          <Switch
            id="public-signup-toggle"
            checked={globalEnabled}
            onCheckedChange={(checked) =>
              signupMutation.mutate({ enabled: checked })
            }
            disabled={signupMutation.isPending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <span className="text-muted-foreground text-xs">Sign-in methods</span>

        <ProviderToggle
          id="signin-email-toggle"
          label="Email"
          checked={signinProviders.includes("email")}
          onToggle={(checked) => toggleSignin("email", checked)}
          isPending={signinMutation.isPending}
          lockedTooltip={getSigninLockedTooltip("email")}
        />

        {oauthConfigured && (
          <ProviderToggle
            id="signin-oauth-toggle"
            label={oauthProviderName}
            checked={signinProviders.includes("oauth")}
            onToggle={(checked) => toggleSignin("oauth", checked)}
            isPending={signinMutation.isPending}
            lockedTooltip={getSigninLockedTooltip("oauth")}
          />
        )}
      </div>
    </div>
  );
}
