"use client";

import { BanIcon, ChevronRightIcon, ShieldIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "~/components/ui/badge";

interface AdminUserRowProps {
  user: {
    id: string;
    name: string;
    email: string;
    role?: string | null;
    banned?: boolean | null;
  };
}

export function AdminUserRow({ user }: AdminUserRowProps) {
  return (
    <Link
      to="/admin/user/$id"
      params={{ id: user.id }}
      className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{user.name}</span>
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
        <span className="text-muted-foreground truncate text-sm">
          {user.email}
        </span>
      </div>
      <ChevronRightIcon className="text-muted-foreground shrink-0" size={20} />
    </Link>
  );
}
