"use client";

import { Link } from "@tanstack/react-router";
import { ImportIcon, PlusIcon, SproutIcon } from "lucide-react";
import { useDialogStore } from "../dialogStore";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export function EmptyState() {
  return (
    <div className="w-full px-6 md:py-6">
      <div className="bg-muted flex w-full flex-col items-center justify-center rounded p-12">
        <SproutIcon size={40} />
        <h2 className="pt-2 text-lg font-semibold">
          You&apos;ve seen everything!
        </h2>
        <p className="max-w-xs pt-1 text-center text-sm opacity-80">
          Take a walk, buy a sweet treat, or do something else that will make
          you happy today.
        </p>
      </div>
    </div>
  );
}

export function FeedEmptyState() {
  const launchDialog = useDialogStore((store) => store.launchDialog);

  return (
    <>
      <div className="w-full px-6 pt-6 pb-4 md:pt-16 md:text-center">
        <h2 className="font-mono text-xl font-bold">Welcome to Serial!</h2>
        <p className="">There are a couple ways to get started:</p>
      </div>
      <div className="flex w-full flex-col gap-4 px-6 md:flex-row">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Add feeds manually</CardTitle>
            <CardDescription>
              Add one or more feeds by
              <ul className="list-disc pl-4">
                <li>YouTube Channel URL</li>
                <li>RSS Feed URL</li>
              </ul>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col justify-end">
            <Button onClick={() => launchDialog("add-feed")}>
              <PlusIcon size={16} />
              <span className="pl-1.5">Add Feed</span>
            </Button>
          </CardContent>
        </Card>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Import feeds from elsewhere</CardTitle>
            <CardDescription>
              Serial supports importing from
              <ul className="list-disc pl-4">
                <li>
                  Google Takeout (<code>subscriptions.csv</code>)
                </li>
                <li>
                  Other RSS readers (<code>.opml</code>)
                </li>
              </ul>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col justify-end">
            <Button asChild>
              <Link to="/import">
                <ImportIcon size={16} />
                <span className="pl-1.5">Import Feeds</span>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
