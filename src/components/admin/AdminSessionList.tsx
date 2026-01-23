"use client";

import dayjs from "dayjs";
import { MonitorIcon, SmartphoneIcon, UserIcon } from "lucide-react";
import { Badge } from "~/components/ui/badge";

interface Session {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
  expiresAt: Date;
  impersonatedBy?: string | null;
}

interface AdminSessionListProps {
  sessions: Session[];
}

function getDeviceIcon(userAgent?: string | null) {
  if (!userAgent) return <MonitorIcon size={16} />;
  const ua = userAgent.toLowerCase();
  if (
    ua.includes("mobile") ||
    ua.includes("iphone") ||
    ua.includes("android")
  ) {
    return <SmartphoneIcon size={16} />;
  }
  return <MonitorIcon size={16} />;
}

function getDeviceName(userAgent?: string | null) {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();

  // Browser detection
  let browser = "Unknown browser";
  if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("edg")) browser = "Edge";
  else if (ua.includes("chrome")) browser = "Chrome";
  else if (ua.includes("safari")) browser = "Safari";

  // OS detection
  let os = "";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac")) os = "macOS";
  else if (ua.includes("linux")) os = "Linux";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
  else if (ua.includes("android")) os = "Android";

  return os ? `${browser} on ${os}` : browser;
}

export function AdminSessionList({ sessions }: AdminSessionListProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No active sessions
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => {
        const isExpired = new Date(session.expiresAt) < new Date();

        return (
          <div
            key={session.id}
            className="flex items-start justify-between gap-3 rounded-lg border p-3"
          >
            <div className="flex items-start gap-3">
              <div className="text-muted-foreground mt-0.5">
                {getDeviceIcon(session.userAgent)}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {getDeviceName(session.userAgent)}
                  </span>
                  {session.impersonatedBy && (
                    <Badge variant="secondary" className="gap-1">
                      <UserIcon size={12} />
                      Impersonated
                    </Badge>
                  )}
                  {isExpired && <Badge variant="outline">Expired</Badge>}
                </div>
                <div className="text-muted-foreground flex flex-col text-xs">
                  {session.ipAddress && <span>IP: {session.ipAddress}</span>}
                  <span>
                    Created:{" "}
                    {dayjs(session.createdAt).format("MMM D, YYYY h:mm A")}
                  </span>
                  <span>
                    Expires:{" "}
                    {dayjs(session.expiresAt).format("MMM D, YYYY h:mm A")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
