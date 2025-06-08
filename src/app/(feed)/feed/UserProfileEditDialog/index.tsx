"use client";

import { EditableSavableTextField } from "~/components/form/EditableSavableTextField";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { authClient } from "~/lib/auth-client";
import { useDialogStore } from "../dialogStore";

import { useUpdateEmailMutation } from "~/lib/data/user/useUpdateEmailMutation";
import { useUpdateNameMutation } from "~/lib/data/user/useUpdateNameMutation";
import { userEmailSchema, userNameSchema } from "~/server/api/schemas";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import Link from "next/link";
import { AUTH_RESET_PASSWORD_URL } from "~/server/auth/constants";
import { DeleteAccountSection } from "./DeleteAccountSection";

export function UserProfileEditDialog() {
  const { data, refetch: refetchUser } = authClient.useSession();

  const { dialog, onOpenChange } = useDialogStore();

  const { mutateAsync: updateName } = useUpdateNameMutation();
  const { mutateAsync: updateEmail } = useUpdateEmailMutation();

  const userEmail = data?.user.email ?? "";

  return (
    <Dialog open={dialog === "edit-user-profile"} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">Edit Profile</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6">
          <EditableSavableTextField
            label="Name"
            placeholder="Serial User"
            initialValue={data?.user.name ?? ""}
            onSave={async (updatedName) => {
              await updateName({ name: updatedName });
              refetchUser();
            }}
            schema={userNameSchema}
          />
          <EditableSavableTextField
            label="Email"
            helperText="Be careful! This will be your new sign in email."
            placeholder="user@example.com"
            initialValue={userEmail}
            onSave={async (updatedEmail) => {
              await updateEmail({ email: updatedEmail });
              refetchUser();
            }}
            schema={userEmailSchema}
          />
          <div className="grid gap-2">
            <Label>Password</Label>
            <Button variant="outline" asChild>
              <Link
                href={`${AUTH_RESET_PASSWORD_URL}?email=${encodeURIComponent(userEmail)}`}
              >
                Update password
              </Link>
            </Button>
          </div>
          <hr />
          <DeleteAccountSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}
