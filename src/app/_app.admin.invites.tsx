"use client";

import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminInviteList } from "~/components/admin/AdminInviteList";
import { AdminTabs } from "~/components/admin/AdminTabs";
import { InviteUserDialog } from "~/components/admin/InviteUserDialog";
import { Button } from "~/components/ui/button";
import { orpc } from "~/lib/orpc";
import { adminMiddleware } from "~/server/auth";

export const Route = createFileRoute("/_app/admin/invites")({
  component: AdminInvitesPage,
  server: {
    middleware: [adminMiddleware],
  },
});

function AdminInvitesPage() {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleCreated = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.admin.listInvitations.queryKey(),
    });
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <AdminTabs value="invites" />
        <Button
          variant="outline"
          size="icon"
          aria-label="Create invite link"
          onClick={() => setInviteDialogOpen(true)}
        >
          <PlusIcon size={16} />
        </Button>
      </div>

      <div className="mt-6">
        <AdminInviteList />
      </div>

      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
