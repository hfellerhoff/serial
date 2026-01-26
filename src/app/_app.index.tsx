import { createFileRoute } from "@tanstack/react-router";
import { ClientDatetime } from "~/components/feed/ClientDatetime";
import { ItemVisibilityChips } from "~/components/feed/ItemVisibilityChips";
import { MarkVisibleAsReadButton } from "~/components/feed/MarkVisibleAsReadButton";
import { RenderViewItems } from "~/components/feed/view-lists";
import { ViewFilterChips } from "~/components/feed/ViewFilterChips";

export const Route = createFileRoute("/_app/")({
  component: Home,
});

function Home() {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center lg:pb-18">
      <div className="flex w-full flex-col px-6 pb-6 md:items-center md:text-center">
        <h1 className="font-mono text-2xl font-bold">Serial</h1>
        <p className="pb-2 font-mono">
          <ClientDatetime />
        </p>
        <div className="flex w-max gap-1 pt-1">
          <ItemVisibilityChips />
        </div>
        <div className="w-max pt-3">
          <ViewFilterChips />
        </div>
      </div>
      <RenderViewItems />
      <MarkVisibleAsReadButton />
    </div>
  );
}
