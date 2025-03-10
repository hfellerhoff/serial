"use client";

import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";

import { useAtom } from "jotai";
import { categoryFilterAtom } from "~/lib/data/atoms";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";

export function CategorySelectionChips() {
  const [categoryFilter, setCategoryFilter] = useAtom(categoryFilterAtom);

  const trpc = useTRPC();
  const { data: categories } = useQuery(
    trpc.contentCategories.getAllForUser.queryOptions(),
  );

  return (
    <ScrollArea className="pb-2">
      <ToggleGroup
        type="single"
        value={categoryFilter.toString()}
        onValueChange={(value) => {
          setCategoryFilter(parseInt(value));
        }}
        size="sm"
      >
        <ToggleGroupItem value="-1">All</ToggleGroupItem>
        {categories?.map((option) => (
          <ToggleGroupItem value={option.id.toString()} className="w-max">
            {option.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
