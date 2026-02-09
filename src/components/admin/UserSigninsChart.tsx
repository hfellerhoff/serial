"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import type { ChartConfig } from "~/components/ui/chart";
import { orpc } from "~/lib/orpc";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

const chartConfig = {
  count: {
    label: "Sign-ins",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

type TimeRange = "30d" | "1y" | "all";

export function UserSigninsChart() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const { data, isLoading } = useQuery(
    orpc.admin.getSigninStats.queryOptions({ input: { timeRange } }),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-sans text-base font-medium">
          User Sign-ins
        </CardTitle>
        <Tabs
          value={timeRange}
          onValueChange={(value) => setTimeRange(value as TimeRange)}
        >
          <TabsList>
            <TabsTrigger value="30d">30 days</TabsTrigger>
            <TabsTrigger value="1y">1 year</TabsTrigger>
            <TabsTrigger value="all">All time</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center">
            Loading...
          </div>
        ) : !data?.stats.length ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center">
            No data available
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart data={data.stats} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: string) => {
                  if (timeRange === "30d") {
                    // Show month/day for daily data
                    const [, month, day] = value.split("-");
                    return `${month}/${day}`;
                  } else if (timeRange === "1y") {
                    // Show week format (YYYY-WW -> just WXX)
                    const [, week] = value.split("-");
                    return `W${week}`;
                  }
                  // Show month for all time (YYYY-MM -> YYYY-MM)
                  return value;
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideIndicator />}
              />
              <Line
                dataKey="count"
                type="monotone"
                stroke="var(--color-count)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
