"use client";

import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, DownloadIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogStore } from "../dialogStore";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { ExportDataSection } from "./ExportDataSection";
import { EditableSavableTextField } from "~/components/form/EditableSavableTextField";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { authClient } from "~/lib/auth-client";
import { useUpdateNameMutation } from "~/lib/data/user/useUpdateNameMutation";
import { userEmailSchema, userNameSchema } from "~/server/api/schemas";
import { AUTH_RESET_PASSWORD_URL } from "~/server/auth/constants";

type SettingsPane = "main" | "export" | "delete";

export function UserProfileEditDialog() {
  const { data, refetch: refetchUser } = authClient.useSession();

  const { dialog, onOpenChange } = useDialogStore();

  const { mutateAsync: updateName } = useUpdateNameMutation();

  const [pane, setPane] = useState<SettingsPane>("main");

  const isOpen = dialog === "edit-user-profile";

  // Reset to main pane whenever the dialog closes
  useEffect(() => {
    if (!isOpen) {
      setPane("main");
    }
  }, [isOpen]);

  const userEmail = data?.user.email ?? "";

  if (pane === "export") {
    return (
      <ControlledResponsiveDialog
        open={isOpen}
        onOpenChange={onOpenChange}
        title="Export Data"
        description="Download your feeds as an OPML file."
        onBack={() => setPane("main")}
      >
        <ExportDataSection />
      </ControlledResponsiveDialog>
    );
  }

  if (pane === "delete") {
    return (
      <ControlledResponsiveDialog
        open={isOpen}
        onOpenChange={onOpenChange}
        title="Delete Account"
        description="Permanently delete your account and all associated data."
        onBack={() => setPane("main")}
      >
        <DeleteAccountSection />
      </ControlledResponsiveDialog>
    );
  }

  return (
    <ControlledResponsiveDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Manage your account and your data"
    >
      <div className="grid gap-6">
        <EditableSavableTextField
          label="Name"
          placeholder="Serial User"
          initialValue={data?.user.name ?? ""}
          onSave={async (updatedName) => {
            await updateName({ name: updatedName });
            void refetchUser();
          }}
          schema={userNameSchema}
        />
        <EditableSavableTextField
          label="Email"
          helperText="A verification email will be sent to confirm the change."
          showHelperTextOnlyWhenEditing
          placeholder="user@example.com"
          initialValue={userEmail}
          onSave={async (updatedEmail) => {
            const { error } = await authClient.changeEmail({
              newEmail: updatedEmail,
              callbackURL: "/",
            });
            if (error) {
              toast.error(error.message ?? "Failed to change email");
              return;
            }
            toast.success(
              "Verification email sent! Check your new inbox to confirm.",
            );
          }}
          schema={userEmailSchema}
        />
        <div className="grid gap-2">
          <Label>Password</Label>
          <Button variant="outline" asChild>
            <Link
              to={AUTH_RESET_PASSWORD_URL}
              search={{
                email: userEmail,
              }}
            >
              Update password
            </Link>
          </Button>
        </div>
        <div className="grid gap-2">
          <Label>Data</Label>
          <Button
            variant="outline"
            className="justify-between"
            onClick={() => setPane("export")}
          >
            <span className="flex items-center">
              <DownloadIcon size={16} />
              <span className="pl-1.5">Export Data</span>
            </span>
            <ChevronRightIcon size={16} />
          </Button>
          <Button
            variant="outline"
            className="justify-between"
            onClick={() => setPane("delete")}
          >
            <span className="flex items-center">
              <Trash2Icon size={16} />
              <span className="pl-1.5">Delete Account</span>
            </span>
            <ChevronRightIcon size={16} />
          </Button>
        </div>
      </div>
    </ControlledResponsiveDialog>
  );
}
