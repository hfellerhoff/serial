import dayjs from "dayjs";
import type { RSSContent } from "./types";

export const isWithinDays = (date: string, days: number) => {
  return dayjs().diff(date) < days * 24 * 60 * 60 * 1000;
};

export const sortRSSContentByDate = (a: RSSContent, b: RSSContent) => {
  return dayjs(b.publishedDate).diff(a.publishedDate);
};
