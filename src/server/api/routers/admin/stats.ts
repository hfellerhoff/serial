import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "./base";
import { feeds, session, user } from "~/server/db/schema";
import { db } from "~/server/db";

// Time range schema for stats
const timeRangeSchema = z.enum(["30d", "1y", "all"]);

function getTimeRangeParams(timeRange: z.infer<typeof timeRangeSchema>) {
  const now = new Date();
  switch (timeRange) {
    case "30d":
      return {
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        groupBy: "%Y-%m-%d",
      };
    case "1y":
      return {
        startDate: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
        groupBy: "%Y-%W",
      };
    case "all":
      return {
        startDate: null,
        groupBy: "%Y-%m",
      };
  }
}

function fillDateGaps(
  results: Array<{ date: string; count: number }>,
  timeRange: z.infer<typeof timeRangeSchema>,
  startDate: Date | null,
): Array<{ date: string; count: number }> {
  if (results.length === 0) return results;

  const existing = new Map(results.map((r) => [r.date, r.count]));
  const now = new Date();
  const keys: string[] = [];

  if (timeRange === "30d") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      keys.push(`${yyyy}-${mm}-${dd}`);
    }
  } else if (timeRange === "1y") {
    // Generate week keys matching SQLite strftime("%Y-%W")
    // Walk day-by-day from startDate to now, collect unique week keys
    const start =
      startDate ?? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const seen = new Set<string>();
    for (
      let d = new Date(start);
      d <= now;
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    ) {
      const yyyy = d.getFullYear();
      // SQLite %W: week starts Monday, Jan 1 = week 00
      const jan1 = new Date(yyyy, 0, 1);
      const dayOfYear = Math.floor(
        (d.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000),
      );
      // %W counts Monday-starting weeks; Jan 1 day-of-week: 0=Sun..6=Sat
      const jan1Day = jan1.getDay();
      const mondayOffset = jan1Day === 0 ? 6 : jan1Day - 1;
      const weekNum = Math.floor((dayOfYear + mondayOffset) / 7);
      const key = `${yyyy}-${String(weekNum).padStart(2, "0")}`;
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  } else {
    // "all": months from earliest result to now
    const earliest = results[0]!.date; // already sorted by date, length checked above
    const parts = earliest.split("-").map(Number);
    const startYear = parts[0]!;
    const startMonth = parts[1]!;
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;
    for (
      let y = startYear, m = startMonth;
      y < endYear || (y === endYear && m <= endMonth);
      m++
    ) {
      if (m > 12) {
        m = 1;
        y++;
      }
      keys.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }

  return keys.map((key) => ({ date: key, count: existing.get(key) ?? 0 }));
}

// Get sign-up stats grouped by time period
export const getSignupStats = adminProcedure
  .input(z.object({ timeRange: timeRangeSchema }))
  .handler(async ({ input }) => {
    const { startDate, groupBy } = getTimeRangeParams(input.timeRange);

    const dateGroup = sql<string>`strftime(${groupBy}, datetime(${user.createdAt}, 'unixepoch'))`;

    const query = db
      .select({
        date: dateGroup,
        count: count(),
      })
      .from(user);

    const results = startDate
      ? await query
          .where(gte(user.createdAt, startDate))
          .groupBy(dateGroup)
          .orderBy(dateGroup)
          .all()
      : await query.groupBy(dateGroup).orderBy(dateGroup).all();

    const stats = results.map((r) => ({ date: r.date, count: r.count }));
    return {
      stats: fillDateGaps(stats, input.timeRange, startDate),
    };
  });

// Get sign-in stats grouped by time period
export const getSigninStats = adminProcedure
  .input(z.object({ timeRange: timeRangeSchema }))
  .handler(async ({ input }) => {
    const { startDate, groupBy } = getTimeRangeParams(input.timeRange);

    const dateGroup = sql<string>`strftime(${groupBy}, datetime(${session.createdAt}, 'unixepoch'))`;

    // Build where clause - always exclude impersonation sessions
    const whereClause = startDate
      ? and(isNull(session.impersonatedBy), gte(session.createdAt, startDate))
      : isNull(session.impersonatedBy);

    const results = await db
      .select({
        date: dateGroup,
        count: count(),
      })
      .from(session)
      .where(whereClause)
      .groupBy(dateGroup)
      .orderBy(dateGroup)
      .all();

    const stats = results.map((r) => ({ date: r.date, count: r.count }));
    return {
      stats: fillDateGaps(stats, input.timeRange, startDate),
    };
  });

// Get retention stats by months since signup (0-12)
export const getRetentionStats = adminProcedure.handler(async () => {
  const now = new Date();
  const currentAbsMonth = now.getFullYear() * 12 + (now.getMonth() + 1);
  const minSignupDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Month offset between session creation and user signup
  const monthOffsetExpr = sql<number>`
    (CAST(strftime('%Y', datetime(${session.createdAt}, 'unixepoch')) AS INTEGER)
     - CAST(strftime('%Y', datetime(${user.createdAt}, 'unixepoch')) AS INTEGER)) * 12
    + (CAST(strftime('%m', datetime(${session.createdAt}, 'unixepoch')) AS INTEGER)
     - CAST(strftime('%m', datetime(${user.createdAt}, 'unixepoch')) AS INTEGER))`;

  // Signup absolute month expression
  const signupAbsMonthExpr = sql<number>`
    CAST(strftime('%Y', datetime(${user.createdAt}, 'unixepoch')) AS INTEGER) * 12
    + CAST(strftime('%m', datetime(${user.createdAt}, 'unixepoch')) AS INTEGER)`;

  // Count distinct active users per (month offset, signup month), excluding impersonation
  // Only include users who signed up on or after 2025-04
  const activeResults = await db
    .select({
      month: monthOffsetExpr,
      signupMonth: signupAbsMonthExpr,
      activeUsers: sql<number>`COUNT(DISTINCT ${session.userId})`,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(
      and(
        isNull(session.impersonatedBy),
        gte(user.createdAt, minSignupDate),
        sql`${monthOffsetExpr} >= 0`,
        sql`${monthOffsetExpr} <= 12`,
      ),
    )
    .groupBy(monthOffsetExpr, signupAbsMonthExpr)
    .orderBy(monthOffsetExpr)
    .all();

  // Get signup absolute month for each user (only those who signed up on or after 2025-04)
  const signupMonths = await db
    .select({
      absMonth: sql<number>`CAST(strftime('%Y', datetime(${user.createdAt}, 'unixepoch')) AS INTEGER) * 12 + CAST(strftime('%m', datetime(${user.createdAt}, 'unixepoch')) AS INTEGER)`,
    })
    .from(user)
    .where(gte(user.createdAt, minSignupDate))
    .all();

  if (signupMonths.length === 0) {
    return { stats: [] };
  }

  // Build a map of (monthOffset, signupMonth) -> activeUsers
  const activeByOffsetAndSignup = new Map<string, number>();
  // Also build the aggregate map for all-users line
  const activeMap = new Map<number, number>();
  for (const r of activeResults) {
    activeByOffsetAndSignup.set(`${r.month}:${r.signupMonth}`, r.activeUsers);
    activeMap.set(r.month, (activeMap.get(r.month) ?? 0) + r.activeUsers);
  }

  const cohortWindows = [1, 3, 6, 9] as const;

  // For each month offset 0-12, compute eligible users and retention rate
  const stats = [];
  for (let n = 0; n <= 12; n++) {
    // User is eligible for month N if they signed up at least N months ago
    const maxSignupAbsMonth = currentAbsMonth - n;
    const totalUsers = signupMonths.filter(
      (u) => u.absMonth <= maxSignupAbsMonth,
    ).length;
    const activeUsers = activeMap.get(n) ?? 0;
    const retentionRate =
      totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 1000) / 10 : 0;

    const point: Record<string, number | undefined> = {
      month: n,
      retentionRate,
      activeUsers,
      totalUsers,
    };

    // Compute cohort-specific retention
    // A W-month cohort = all users who signed up in [currentAbsMonth-W, currentAbsMonth].
    // The denominator is fixed (total cohort size). The numerator only counts
    // users active at offset N — users too new to reach offset N naturally
    // won't appear in activeByOffsetAndSignup.
    for (const w of cohortWindows) {
      if (n > w) continue;
      const cohortMinAbsMonth = currentAbsMonth - w;
      const cohortTotal = signupMonths.filter(
        (u) => u.absMonth >= cohortMinAbsMonth,
      ).length;
      if (cohortTotal === 0) continue;
      // Collect all unique signup months in this cohort
      const cohortMonths = new Set(
        signupMonths
          .filter((u) => u.absMonth >= cohortMinAbsMonth)
          .map((u) => u.absMonth),
      );
      let cohortActive = 0;
      for (const sm of cohortMonths) {
        cohortActive += activeByOffsetAndSignup.get(`${n}:${sm}`) ?? 0;
      }
      const rate = Math.round((cohortActive / cohortTotal) * 1000) / 10;
      point[`retention${w}mo`] = rate;
      point[`active${w}mo`] = cohortActive;
      point[`total${w}mo`] = cohortTotal;
    }

    stats.push(point);
  }

  return { stats };
});

// Get distribution of feed counts per user (how many users have N feeds)
export const getFeedCountDistribution = adminProcedure.handler(async () => {
  // Count all feeds per user (subquery)
  const allFeedsSq = db
    .select({
      userId: feeds.userId,
      feedCount: count().as("feed_count"),
    })
    .from(feeds)
    .groupBy(feeds.userId)
    .as("user_feeds");

  // Aggregate: how many users have each feed count
  const allFeedCounts = await db
    .select({
      feedCount: allFeedsSq.feedCount,
      userCount: count(),
    })
    .from(allFeedsSq)
    .groupBy(sql`${allFeedsSq.feedCount}`)
    .orderBy(sql`${allFeedsSq.feedCount}`)
    .all();

  // Count active feeds per user (subquery)
  const activeFeedsSq = db
    .select({
      userId: feeds.userId,
      feedCount: count().as("feed_count"),
    })
    .from(feeds)
    .where(eq(feeds.isActive, true))
    .groupBy(feeds.userId)
    .as("active_user_feeds");

  // Aggregate: how many users have each active feed count
  const activeFeedCounts = await db
    .select({
      feedCount: activeFeedsSq.feedCount,
      userCount: count(),
    })
    .from(activeFeedsSq)
    .groupBy(sql`${activeFeedsSq.feedCount}`)
    .orderBy(sql`${activeFeedsSq.feedCount}`)
    .all();

  // Merge into a single array keyed by feedCount
  const allMap = new Map(allFeedCounts.map((r) => [r.feedCount, r.userCount]));
  const activeMap = new Map(
    activeFeedCounts.map((r) => [r.feedCount, r.userCount]),
  );

  const maxFeedCount = Math.max(
    ...allFeedCounts.map((r) => r.feedCount),
    ...activeFeedCounts.map((r) => r.feedCount),
    0,
  );

  const distribution = [];
  for (let i = 1; i <= maxFeedCount; i++) {
    const allUsers = allMap.get(i) ?? 0;
    const activeUsers = activeMap.get(i) ?? 0;
    if (allUsers > 0 || activeUsers > 0) {
      distribution.push({
        feedCount: i,
        allUsers,
        activeUsers,
      });
    }
  }

  return { distribution };
});
