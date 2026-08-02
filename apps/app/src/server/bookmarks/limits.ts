import { env } from "~/env";

type CaptureSurface = "app" | "extension" | "discovery";

type SurfacePolicy = {
  attempts: number;
  windowMs: number;
  activePerUser: number;
};

const SURFACE_POLICIES: Record<CaptureSurface, SurfacePolicy> = {
  app: { attempts: 10, windowMs: 10 * 60 * 1_000, activePerUser: 1 },
  extension: { attempts: 30, windowMs: 10 * 60 * 1_000, activePerUser: 2 },
  discovery: { attempts: 30, windowMs: 10 * 60 * 1_000, activePerUser: 2 },
};

export type CaptureLease =
  | { ok: false; reason: "rate_limited" | "capacity_limited" }
  | { ok: true; release: () => void };

export class CaptureLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly active = new Map<string, number>();
  private activeServerFetches = 0;

  constructor(
    private readonly maxServerFetches: number,
    private readonly now: () => number = Date.now,
  ) {}

  acquire(userId: string, surface: CaptureSurface): CaptureLease {
    const policy = SURFACE_POLICIES[surface];
    const key = `${surface}:${userId}`;
    const now = this.now();
    const recentAttempts = (this.attempts.get(key) ?? []).filter(
      (timestamp) => timestamp > now - policy.windowMs,
    );
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);

    if (recentAttempts.length > policy.attempts) {
      return { ok: false, reason: "rate_limited" };
    }

    const activeForUser = this.active.get(key) ?? 0;
    const usesServerCapacity = surface === "app" || surface === "discovery";
    const serverCapacityReached =
      usesServerCapacity && this.activeServerFetches >= this.maxServerFetches;
    if (activeForUser >= policy.activePerUser || serverCapacityReached) {
      return { ok: false, reason: "capacity_limited" };
    }

    this.active.set(key, activeForUser + 1);
    if (usesServerCapacity) this.activeServerFetches += 1;
    let released = false;

    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        const active = this.active.get(key) ?? 1;
        if (active <= 1) this.active.delete(key);
        else this.active.set(key, active - 1);
        if (usesServerCapacity) this.activeServerFetches -= 1;
      },
    };
  }
}

export const captureLimiter = new CaptureLimiter(
  env.SERIAL_CAPTURE_MAX_CONCURRENT_FETCHES,
);
