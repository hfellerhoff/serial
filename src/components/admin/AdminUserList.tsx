"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminUserRow } from "./AdminUserRow";
import { Input } from "~/components/ui/input";
import { useInfiniteScroll } from "~/lib/hooks/useInfiniteScroll";
import { orpc, orpcRouterClient } from "~/lib/orpc";

const PAGE_SIZE = 50;

interface User {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
}

export function AdminUserList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setUsers([]);
      setOffset(0);
      setHasMore(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initial query
  const { data, isLoading, isFetching } = useQuery(
    orpc.admin.listUsers.queryOptions({
      input: {
        limit: PAGE_SIZE,
        offset: 0,
        searchQuery: debouncedSearch || undefined,
      },
    }),
  );

  // Update users when data changes
  useEffect(() => {
    if (data && offset === 0) {
      setUsers(data.users as User[]);
      setOffset(PAGE_SIZE);
      setHasMore(data.users.length >= PAGE_SIZE);
    }
  }, [data, offset]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || offset === 0) return;
    setIsLoadingMore(true);

    try {
      const result = await orpcRouterClient.admin.listUsers({
        limit: PAGE_SIZE,
        offset,
        searchQuery: debouncedSearch || undefined,
      });

      setUsers((prev) => [...prev, ...(result.users as User[])]);
      setOffset((prev) => prev + PAGE_SIZE);
      setHasMore(result.users.length >= PAGE_SIZE);
    } finally {
      setIsLoadingMore(false);
    }
  }, [offset, debouncedSearch, isLoadingMore, hasMore]);

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: isLoadingMore,
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const displayUsers = offset === 0 && data ? (data.users as User[]) : users;

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search by email..."
        value={searchQuery}
        onChange={handleSearchChange}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2Icon className="animate-spin" size={24} />
        </div>
      ) : displayUsers.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          {debouncedSearch
            ? `No users match "${debouncedSearch}"`
            : "No users found"}
        </p>
      ) : (
        <div className="-mx-3 flex flex-col">
          {displayUsers.map((user) => (
            <AdminUserRow key={user.id} user={user} />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {(isLoadingMore || isFetching) && (
            <div className="flex items-center justify-center py-4">
              <Loader2Icon className="animate-spin" size={20} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
