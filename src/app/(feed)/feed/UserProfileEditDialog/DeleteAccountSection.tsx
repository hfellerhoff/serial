import { useState } from "react";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useDeleteAccountMutation } from "~/lib/data/user/useDeleteAccountMutation";

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
  const { mutate: deleteAccount } = useDeleteAccountMutation();

  return (
    <>
      <p className="text-foreground/70 text-sm">
        To confirm, type "{DELETE_FIELD_TARGET_VALUE}" in the field below, then
        click "Delete Account".
      </p>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();

          const formValues = new FormData(e.currentTarget);
          const fieldValue = formValues.get(DELETE_FIELD_NAME);

          const { success } = targetValueSchema.safeParse(fieldValue);

          if (!success) {
            return;
          }

          deleteAccount();
        }}
      >
        <Input name={DELETE_FIELD_NAME} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button type="submit" variant="destructive">
            Delete Account
          </Button>
        </div>
      </form>
    </>
  );
}

export function DeleteAccountSection() {
  const [isConfirmation, setIsConfirmation] = useState(false);

  return (
    <div className="grid gap-2">
      <Label>Delete Account</Label>
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
