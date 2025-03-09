"use server";

import { getServerApi } from "~/server/api/server";

export async function getItemsAndFeeds() {
  const api = await getServerApi();
  return await api.feed.getAllFeedData();
}
