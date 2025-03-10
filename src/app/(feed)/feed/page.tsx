import React from "react";
import { ClientDatetime } from "./ClientDatetime";
import { DateFilterChips } from "./DateFilterChips";
import { ItemVisibilityChips } from "./ItemVisibilityChips";
import { TodayItems } from "./TodayItems";
import { CategorySelectionChips } from "./CategorySelectionChips";

export default async function Home() {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center lg:pb-18">
      <div className="flex w-full flex-col px-6 md:items-center md:text-center">
        <h1 className="font-mono text-2xl font-bold">Serial</h1>
        <p className="pb-2 font-mono">
          <ClientDatetime />
        </p>
        <div className="w-max pt-2">
          <DateFilterChips />
        </div>
        <div className="w-max pt-2">
          <ItemVisibilityChips />
        </div>
        <div className="w-max max-w-full self-start pt-6 pb-2 md:w-full md:pt-12 md:pb-0">
          <CategorySelectionChips />
        </div>
      </div>
      <TodayItems />
    </div>
  );
}
