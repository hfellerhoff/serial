import { ClientDatetime } from "./ClientDatetime";
import { DateFilterChips } from "./DateFilterChips";
import { ItemVisibilityChips } from "./ItemVisibilityChips";
import { TodayItems } from "./TodayItems";
import { ViewFilterChips } from "./ViewFilterChips";

export default async function Home() {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center lg:pb-18">
      <div className="flex w-full flex-col px-6 pb-6 md:items-center md:text-center">
        <h1 className="font-mono text-2xl font-bold">Serial</h1>
        <p className="pb-2 font-mono">
          <ClientDatetime />
        </p>
        <div className="w-max pt-2">
          <ViewFilterChips />
        </div>
      </div>
      <TodayItems />
    </div>
  );
}
