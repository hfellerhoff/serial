export type BackgroundRefreshRunOutcome<TResult> =
  { status: "completed"; result: TResult } | { status: "skipped-overlap" };

/**
 * Single-process mutual exclusion for the scheduled background refresh.
 *
 * The task fires every minute, but one run can outlast a tick when a user
 * has many due Feeds. A tick that arrives while the previous run is still in
 * progress is skipped instead of walking the user table concurrently.
 *
 * This guard is process-local by design; multi-process deployments need a
 * shared lease instead.
 */
export function createBackgroundRefreshRunGuard() {
  let inProgress = false;

  return {
    async run<TResult>(
      execute: () => Promise<TResult>,
    ): Promise<BackgroundRefreshRunOutcome<TResult>> {
      if (inProgress) return { status: "skipped-overlap" };
      inProgress = true;
      try {
        return { status: "completed", result: await execute() };
      } finally {
        inProgress = false;
      }
    },
  };
}

// Nitro tasks can re-instantiate modules in a separate context; keep one
// guard per process the same way the publisher is shared.
const GUARD_KEY = Symbol.for("serial:backgroundRefreshRunGuard");
const globalRef = globalThis as unknown as Record<
  symbol,
  ReturnType<typeof createBackgroundRefreshRunGuard>
>;
if (!globalRef[GUARD_KEY]) {
  globalRef[GUARD_KEY] = createBackgroundRefreshRunGuard();
}

export const backgroundRefreshRunGuard = globalRef[GUARD_KEY];
