"use client";

import dayjs from "dayjs";
import {
  ArrowLeftIcon,
  BanIcon,
  MailIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AdminSessionList } from "./AdminSessionList";
import { AdminUserActions } from "./AdminUserActions";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useSession } from "~/lib/auth-client";

interface AdminUserDetailsProps {
  data: {
    user: {
      id: string;
      name: string;
      email: string;
      role?: string | null;
      banned?: boolean | null;
      banReason?: string | null;
      banExpires?: Date | null;
      createdAt: Date;
    };
    sessions: Array<{
      id: string;
      userAgent?: string | null;
      ipAddress?: string | null;
      createdAt: Date;
      expiresAt: Date;
      impersonatedBy?: string | null;
    }>;
  };
}

export function AdminUserDetails({ data }: AdminUserDetailsProps) {
  const { data: session } = useSession();
  const { user, sessions } = data;
  const isCurrentUser = session?.user.id === user.id;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeftIcon className="mr-2" size={16} />
          Back to Users
        </Button>
      </Link>

      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{user.name}</h2>
              {user.role === "admin" && (
                <Badge variant="secondary" className="gap-1">
                  <ShieldIcon size={12} />
                  Admin
                </Badge>
              )}
              {user.banned && (
                <Badge variant="destructive" className="gap-1">
                  <BanIcon size={12} />
                  Banned
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <MailIcon size={14} />
              {user.email}
            </div>
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <UserIcon size={14} />
            {user.id}
          </div>
        </div>

        <div className="text-muted-foreground grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="font-medium">Created:</span>{" "}
            {dayjs(user.createdAt).format("MMM D, YYYY h:mm A")}
          </div>
          {user.banned && user.banReason && (
            <div className="col-span-2">
              <span className="font-medium">Ban reason:</span> {user.banReason}
            </div>
          )}
          {user.banned && user.banExpires && (
            <div>
              <span className="font-medium">Ban expires:</span>{" "}
              {dayjs(user.banExpires).format("MMM D, YYYY h:mm A")}
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <AdminUserActions
            userId={user.id}
            isBanned={user.banned ?? false}
            isCurrentUser={isCurrentUser}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-mono text-lg">Sessions ({sessions.length})</h3>
        <AdminSessionList sessions={sessions} />
      </div>
    </div>
  );
}
