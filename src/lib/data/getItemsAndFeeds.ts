"use server";

import { getServerApi } from "~/server/api/root";

export async function getItemsAndFeeds() {
  const api = await getServerApi();
  return await api.feed.getAllFeedData();
}
