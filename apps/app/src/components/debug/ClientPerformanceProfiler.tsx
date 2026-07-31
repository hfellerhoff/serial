"use client";

import { Profiler, useEffect } from "react";
import type { ProfilerOnRenderCallback, PropsWithChildren } from "react";

export type ClientPerformanceCommit = {
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
};

type ClientPerformanceWindow = Window & {
  __SERIAL_CLIENT_PERFORMANCE__?: {
    commits: ClientPerformanceCommit[];
  };
};

export function ClientPerformanceProfiler({ children }: PropsWithChildren) {
  const performanceWindow =
    typeof window === "undefined" ? null : (window as ClientPerformanceWindow);
  const auditEnabled =
    performanceWindow !== null &&
    new URLSearchParams(performanceWindow.location.search).has(
      "client-performance-audit",
    );

  useEffect(() => {
    if (!auditEnabled || !performanceWindow) return;
    performanceWindow.__SERIAL_CLIENT_PERFORMANCE__ = { commits: [] };
  }, [auditEnabled, performanceWindow]);

  if (!auditEnabled || !performanceWindow) return children;

  const recordCommit: ProfilerOnRenderCallback = (
    _id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    performanceWindow.__SERIAL_CLIENT_PERFORMANCE__?.commits.push({
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    });
  };

  return (
    <Profiler id="serial-app" onRender={recordCommit}>
      {children}
    </Profiler>
  );
}
