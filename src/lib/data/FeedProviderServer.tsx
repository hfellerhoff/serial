import { type PropsWithChildren } from "react";
import { FeedProvider } from "./FeedProvider";
import { getServerApi } from "~/server/api/server";

export async function FeedProviderServer({ children }: PropsWithChildren) {
  const api = await getServerApi();
  const data = await api.feed.getAllFeedData();

  return <FeedProvider data={data}>{children}</FeedProvider>;
}
