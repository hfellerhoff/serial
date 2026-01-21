"use client";

// Individual skeleton items

export function ListItemSkeleton() {
  return (
    <div className="flex w-full items-center gap-2 pt-4 pr-4 pb-4 pl-6 md:h-20 md:py-4">
      <div className="grid w-16 place-items-center">
        <div className="bg-muted h-9 w-16 animate-pulse rounded" />
      </div>
      <div className="flex h-full flex-1 flex-col justify-center">
        <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
        <div className="bg-muted mt-1 h-3 w-1/2 animate-pulse rounded" />
      </div>
    </div>
  );
}

export function LargeListItemSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4 pt-4 pr-4 pb-1 pl-6 md:flex-row md:items-center md:pb-4">
      <div className="grid w-44 place-items-center">
        <div className="bg-muted aspect-video w-44 animate-pulse rounded" />
      </div>
      <div className="flex h-full flex-1 flex-col justify-center pr-2">
        <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
        <div className="bg-muted mt-1 h-3 w-full animate-pulse rounded" />
        <div className="bg-muted mt-1 h-3 w-1/3 animate-pulse rounded" />
      </div>
    </div>
  );
}

export function GridItemSkeleton() {
  return (
    <div className="flex w-full flex-col rounded p-2">
      <div className="bg-muted aspect-video w-full animate-pulse rounded" />
      <div className="flex flex-1 flex-col justify-center pt-2">
        <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
        <div className="bg-muted mt-0.5 h-3 w-1/2 animate-pulse rounded" />
      </div>
    </div>
  );
}

export function LargeGridItemSkeleton() {
  return (
    <div className="flex w-full flex-col rounded p-2">
      <div className="bg-muted aspect-video w-full animate-pulse rounded" />
      <div className="flex flex-1 flex-col justify-center pt-2">
        <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
        <div className="bg-muted mt-1 h-3 w-full animate-pulse rounded" />
        <div className="bg-muted mt-0.5 h-3 w-1/2 animate-pulse rounded" />
      </div>
    </div>
  );
}

// Wrapper components that render multiple skeleton items

export function StandardListSkeleton() {
  return (
    <div className="w-full transition-all md:pt-4 md:pr-6 md:pl-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
}

export function LargeListSkeleton() {
  return (
    <div className="w-full transition-all md:pt-4 md:pr-6 md:pl-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <LargeListItemSkeleton key={i} />
      ))}
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="w-full">
      <div className="grid w-full grid-cols-2 gap-y-4 px-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(180px,_1fr))] md:gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <GridItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function LargeGridSkeleton() {
  return (
    <div className="w-full">
      <div className="grid w-full gap-4 px-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(250px,_1fr))]">
        {Array.from({ length: 8 }).map((_, i) => (
          <LargeGridItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
