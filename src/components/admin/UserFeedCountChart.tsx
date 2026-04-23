"use client";

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

const chartConfig = {
  allUsers: {
    label: "All Feeds",
    color: "hsl(var(--chart-1))",
  },
  activeUsers: {
    label: "Active Feeds",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export function UserFeedCountChart() {
  const { data, isLoading } = useQuery(
    orpc.admin.getFeedCountDistribution.queryOptions({
      staleTime: 0,
      gcTime: 0,
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans text-base font-medium">
          User Feed Count Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center">
            Loading...
          </div>
        ) : !data?.distribution.length ? (
          <div className="text-muted-foreground flex h-[250px] items-center justify-center">
            No data available
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart data={data.distribution}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="feedCount"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                label={{
                  value: "# of Feeds",
                  position: "insideBottom",
                  offset: -2,
                  className: "fill-muted-foreground text-xs",
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                allowDecimals={false}
                label={{
                  value: "# of Users",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  className: "fill-muted-foreground text-xs",
                }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, payload) => {
                      const item = payload[0];
                      if (!item) return "";
                      return `${item.payload.feedCount} feeds`;
                    }}
                  />
                }
              />
              <Line
                dataKey="allUsers"
                type="monotone"
                stroke="var(--color-allUsers)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="activeUsers"
                type="monotone"
                stroke="var(--color-activeUsers)"
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
