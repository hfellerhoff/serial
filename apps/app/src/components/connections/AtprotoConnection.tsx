import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, Loader2Icon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { AtprotoHandleField } from "~/components/auth/AtprotoHandleField";
import { orpc } from "~/lib/orpc";

export function AtprotoConnectionForm() {
  const linkMutation = useMutation(
    orpc.atproto.linkAccount.mutationOptions({
      onSuccess: (data) => {
        // Hand the browser to the authorization server; the link callback
        // redirects back into the app with the result.
        window.location.assign(data.url);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to connect Atmosphere account");
      },
    }),
  );

  return (
    <AtprotoHandleField
      id="atproto-handle"
      label="Handle"
      submitLabel="Connect"
      busy={linkMutation.isPending}
      focusOnMount
      onSubmit={(submission) => linkMutation.mutate(submission)}
    />
  );
}

export function AtprotoConnectionListItem({
  onSelect,
}: {
  onSelect: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    ...orpc.atproto.getConnectionStatus.queryOptions(),
    // The link callback backfills the handle after redirecting, so a row
    // read right after linking can carry the raw DID. Poll while the
    // "handle" is still DID-shaped (real handles are domains); polling
    // stops when the row unmounts with the dialog.
    refetchInterval: (query) => {
      const data = query.state.data;
      const awaitingHandleBackfill =
        !!data?.isConnected && !!data.handle?.startsWith("did:");
      return awaitingHandleBackfill ? 3000 : false;
    },
  });

  const computedStatus = status ?? {
    isConnected: false,
    needsReconnect: false,
    handle: null,
    isConfigured: false,
  };

  const unlinkMutation = useMutation(
    orpc.atproto.unlinkAccount.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.atproto.getConnectionStatus.queryKey(),
        });
        toast.success("Atmosphere account disconnected");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to disconnect Atmosphere");
      },
    }),
  );

  const isClickable =
    !isLoading && !status?.isConnected && status?.isConfigured;

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onSelect : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={`flex items-center justify-between rounded-lg border p-4 ${
        isClickable ? "hover:bg-muted cursor-pointer transition-colors" : ""
      }`}
    >
      <div className="flex flex-col">
        <span className="font-medium">Atmosphere</span>
        <AtprotoConnectionStatusLine
          isLoading={isLoading}
          status={computedStatus}
        />
      </div>
      <AtprotoConnectionAction
        isLoading={isLoading}
        status={computedStatus}
        disconnecting={unlinkMutation.isPending}
        onDisconnect={() => unlinkMutation.mutate(undefined)}
      />
    </div>
  );
}

interface AtprotoConnectionStatus {
  isConnected: boolean;
  needsReconnect: boolean;
  handle: string | null;
  isConfigured: boolean;
}

function AtprotoConnectionStatusLine({
  isLoading,
  status,
}: {
  isLoading: boolean;
  status: AtprotoConnectionStatus;
}) {
  if (isLoading) {
    return <span className="text-muted-foreground text-sm">Loading...</span>;
  }
  if (!status.isConfigured) {
    return <span className="text-muted-foreground text-sm">Not available</span>;
  }
  if (status.isConnected) {
    return (
      <span className="text-muted-foreground text-sm">{status.handle}</span>
    );
  }
  if (status.needsReconnect) {
    // Credentials were lost (revoked at the PDS, failed refresh) but
    // the sign-in method still exists: the row re-links on click and
    // keeps its disconnect affordance.
    return (
      <span className="text-muted-foreground text-sm">
        Reconnect {status.handle}
      </span>
    );
  }
  return <span className="text-muted-foreground text-sm">Not connected</span>;
}

function AtprotoConnectionAction({
  isLoading,
  status,
  disconnecting,
  onDisconnect,
}: {
  isLoading: boolean;
  status: AtprotoConnectionStatus;
  disconnecting: boolean;
  onDisconnect: () => void;
}) {
  if (isLoading) {
    return (
      <Loader2Icon className="text-muted-foreground animate-spin" size={20} />
    );
  }
  if (!status.isConfigured) return null;
  if (status.isConnected || status.needsReconnect) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onDisconnect();
        }}
        // In the reconnect state the row itself is clickable; keyboard
        // activation must not bubble into its Enter/Space handler (which
        // would preventDefault this button and open the link form).
        onKeyDown={(e) => e.stopPropagation()}
        disabled={disconnecting}
      >
        {disconnecting ? (
          <Loader2Icon className="animate-spin" size={16} />
        ) : (
          <>
            <UnplugIcon size={16} />
            <span className="ml-1.5">Disconnect</span>
          </>
        )}
      </Button>
    );
  }
  return <ChevronRightIcon className="text-muted-foreground" size={20} />;
}
