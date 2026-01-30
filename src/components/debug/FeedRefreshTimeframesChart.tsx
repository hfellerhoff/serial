"use client";

import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import type { ChartConfig } from "~/components/ui/chart";
import type { ApplicationFeed } from "~/server/db/schema";
import { useFeeds } from "~/lib/data/feeds";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

const FIVE_MIN = 5 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const chartConfig = {
  "5min": { label: "Within 5 min", color: COLORS[0] },
  "15min": { label: "Within 15 min", color: COLORS[1] },
  "1hour": { label: "Within 1 hour", color: COLORS[2] },
  "24hours": { label: "Within 24 hours", color: COLORS[3] },
  other: { label: "Other", color: COLORS[4] },
} satisfies ChartConfig;

type CategoryKey = keyof typeof chartConfig;

const CATEGORY_KEYS: CategoryKey[] = [
  "5min",
  "15min",
  "1hour",
  "24hours",
  "other",
];

function computeFeedRefreshStats(feeds: ApplicationFeed[], now: number) {
  const counts: Record<CategoryKey, number> = {
    "5min": 0,
    "15min": 0,
    "1hour": 0,
    "24hours": 0,
    other: 0,
  };

  for (const feed of feeds) {
    if (!feed.nextFetchAt) {
      counts.other++;
      continue;
    }
    const diff = feed.nextFetchAt.getTime() - now;
    if (diff <= FIVE_MIN) counts["5min"]++;
    else if (diff <= FIFTEEN_MIN) counts["15min"]++;
    else if (diff <= ONE_HOUR) counts["1hour"]++;
    else if (diff <= TWENTY_FOUR_HOURS) counts["24hours"]++;
    else counts.other++;
  }

  return CATEGORY_KEYS.map((key) => ({
    name: key,
    label: chartConfig[key].label,
    value: counts[key],
    fill: chartConfig[key].color,
  })).filter((d) => d.value > 0);
}

export function FeedRefreshTimeframesChart() {
  const { feeds } = useFeeds();
  const [now] = useState(() => Date.now());
  const data = computeFeedRefreshStats(feeds, now);

  if (feeds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feed Refresh Timeframes</CardTitle>
          <CardDescription>No feeds available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feed Refresh Timeframes</CardTitle>
        <CardDescription>
          Breakdown of when feeds are scheduled to refresh
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="mx-auto h-[350px] w-full"
        >
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent nameKey="label" hideLabel />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ label, value }) => `${label}: ${value}`}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
