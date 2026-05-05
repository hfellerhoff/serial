import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useDialogStore } from "../dialogStore";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useDeleteAccountMutation } from "~/lib/data/user/useDeleteAccountMutation";
import { orpc } from "~/lib/orpc";

function DeleteAccountInitialSection({
  onClickDelete,
}: {
  onClickDelete: () => void;
}) {
  return (
    <>
      <p className="text-foreground/70 text-sm">
        Deleting your account is permanent. There is no way to recover your data
        once your account is deleted.
      </p>
      <Button onClick={onClickDelete} variant="destructive">
        Delete Account
      </Button>
    </>
  );
}

const DELETE_FIELD_NAME = "delete-account-confirmation-input";
const DELETE_FIELD_TARGET_VALUE = "DELETE MY ACCOUNT";
const targetValueSchema = z.literal(DELETE_FIELD_TARGET_VALUE);

function DeleteAccountConfirmationSection({
  onCancel,
}: {
  onCancel: () => void;
}) {
  const router = useRouter();
  const { mutateAsync: deleteAccount, isPending } = useDeleteAccountMutation();

  return (
    <>
      <p className="text-foreground/70 text-sm">
        To confirm, type &quot;{DELETE_FIELD_TARGET_VALUE}&quot; in the field
        below, then click &quot;Delete Account&quot;.
      </p>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();

          const formValues = new FormData(e.currentTarget);
          const fieldValue = formValues.get(DELETE_FIELD_NAME);

          const { success } = targetValueSchema.safeParse(fieldValue);

          if (!success) {
            return;
          }

          await deleteAccount(undefined);

          void router.navigate({
            to: "/welcome",
            reloadDocument: true,
          });
        }}
      >
        <Input name={DELETE_FIELD_NAME} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={isPending}>
            Delete Account
          </Button>
        </div>
      </form>
    </>
  );
}

export function DeleteAccountSection() {
  const [isConfirmation, setIsConfirmation] = useState(false);
  const { launchDialog } = useDialogStore();

  const { data: subscriptionSummary, isFetched: hasFetchedSummary } = useQuery({
    ...orpc.subscription.getSubscriptionSummary.queryOptions(),
  });

  const { data: pendingSwitch, isFetched: hasFetchedPendingSwitch } = useQuery({
    ...orpc.subscription.getPendingSwitch.queryOptions(),
  });

  const hasActivePlan =
    !!subscriptionSummary?.planId && pendingSwitch?.planId !== "free";

  if (!hasFetchedSummary || !hasFetchedPendingSwitch) {
    return <Skeleton className="h-24" />;
  }

  if (hasActivePlan) {
    return (
      <Alert>
        <AlertTriangleIcon />
        <AlertTitle>You have an active plan</AlertTitle>
        <AlertDescription>
          Please cancel your active plan before deleting your account.
          <Button
            type="button"
            onClick={() =>
              launchDialog("subscription", { subscriptionView: "picker" })
            }
            className="mt-4"
            variant="destructive"
          >
            Cancel Plan
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3">
      {!isConfirmation && (
        <DeleteAccountInitialSection
          onClickDelete={() => {
            setIsConfirmation(true);
          }}
        />
      )}
      {isConfirmation && (
        <DeleteAccountConfirmationSection
          onCancel={() => {
            setIsConfirmation(false);
          }}
        />
      )}
    </div>
  );
}
