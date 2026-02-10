"use client";

import { useMemo, useState } from "react";
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
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";

const chartConfig = {
  retentionRate: {
    label: "All Users",
    color: "hsl(var(--chart-3))",
  },
  retention1mo: {
    label: "Last 1 Month",
    color: "hsl(var(--chart-1))",
  },
  retention3mo: {
    label: "Last 3 Months",
    color: "hsl(var(--chart-2))",
  },
  retention6mo: {
    label: "Last 6 Months",
    color: "hsl(var(--chart-4))",
  },
  retention9mo: {
    label: "Last 9 Months",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig;

type CohortKey = keyof typeof chartConfig;

export function UserRetentionChart() {
  const [showMonth0, setShowMonth0] = useState(true);
  const { data, isLoading } = useQuery(
    orpc.admin.getRetentionStats.queryOptions({
      staleTime: 0,
      gcTime: 0,
    }),
  );

  const stats = data?.stats;

  const chartData = useMemo(() => {
    if (!stats) return [];
    return showMonth0 ? stats : stats.filter((d) => d.month !== 0);
  }, [stats, showMonth0]);

  const yMax = useMemo(() => {
    if (showMonth0 || !stats) return 100;
    const mo1 = stats.find((d) => d.month === 1);
    if (!mo1) return 100;
    const allValues = [
      mo1.retentionRate,
      mo1.retention1mo,
      mo1.retention3mo,
      mo1.retention6mo,
      mo1.retention9mo,
    ].filter((v): v is number => v != null);
    if (allValues.length === 0) return 100;
    const max = Math.max(...allValues);
    return Math.ceil(max / 10) * 10;
  }, [showMonth0, stats]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-sans text-base font-medium">
          Retention by Month Since Signup
        </CardTitle>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="show-month-0"
            className="text-muted-foreground text-xs"
          >
            Show Mo. 0
          </Label>
          <Switch
            id="show-month-0"
            checked={showMonth0}
            onCheckedChange={setShowMonth0}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center">
            Loading...
          </div>
        ) : !chartData.length ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center">
            No data available
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: number) => `Mo. ${value}`}
              />
              <YAxis
                domain={[0, yMax]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: number) => `${value}%`}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, payload) => {
                      const item = payload[0];
                      if (!item) return "";
                      return `Month ${item.payload.month}`;
                    }}
                    formatter={(value, name, item) => {
                      const key = name as CohortKey;
                      const config = chartConfig[key];
                      if (value == null || !config) return null;
                      const p = item.payload as Record<string, number>;
                      // Map retention key to its active/total keys
                      const suffix =
                        key === "retentionRate"
                          ? ""
                          : key.replace("retention", "");
                      const active = suffix
                        ? p[`active${suffix}`]
                        : p.activeUsers;
                      const total = suffix ? p[`total${suffix}`] : p.totalUsers;
                      return (
                        <div className="flex items-center justify-between gap-4">
                          <span
                            className="size-2 rounded-full"
                            style={{ background: config.color }}
                          />
                          <span className="text-muted-foreground text-xs">
                            {config.label}
                          </span>
                          <span className="font-mono text-xs font-medium">
                            {value}%
                            {active != null && total != null && (
                              <span className="text-muted-foreground ml-1 font-normal">
                                ({active}/{total})
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Line
                dataKey="retentionRate"
                type="monotone"
                stroke="var(--color-retentionRate)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="retention1mo"
                type="monotone"
                stroke="var(--color-retention1mo)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                dataKey="retention3mo"
                type="monotone"
                stroke="var(--color-retention3mo)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                dataKey="retention6mo"
                type="monotone"
                stroke="var(--color-retention6mo)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                dataKey="retention9mo"
                type="monotone"
                stroke="var(--color-retention9mo)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
