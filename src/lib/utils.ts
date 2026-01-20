import { clsx } from "clsx";
import dayjs from "dayjs";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import type { ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ONE_MINUTE_MS = 1000 * 60;
const ONE_HOUR_MS = ONE_MINUTE_MS * 60;
const ONE_DAY_MS = ONE_HOUR_MS * 24;

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export function timeAgo(date: string | Date) {
  const now = dayjs();
  const then = dayjs(date);
  const diffMs = now.diff(then);

  if (diffMs < ONE_MINUTE_MS) {
    return "Just now";
  }

  if (diffMs < ONE_HOUR_MS) {
    const minutes = Math.floor(diffMs / ONE_MINUTE_MS);
    return `${minutes} ${pluralize(minutes, "minute", "minutes")} ago`;
  }

  if (diffMs < ONE_DAY_MS) {
    const hours = Math.floor(diffMs / ONE_HOUR_MS);
    return `${hours} ${pluralize(hours, "hour", "hours")} ago`;
  }

  const days = now.diff(then, "day");
  if (days < 30) {
    return `${days} ${pluralize(days, "day", "days")} ago`;
  }

  const months = now.diff(then, "month");
  if (months < 12) {
    return `${months} ${pluralize(months, "month", "months")} ago`;
  }

  const years = now.diff(then, "year");
  return `${years} ${pluralize(years, "year", "years")} ago`;
}

export function handleErrors(error: unknown) {
  // @ts-expect-error deal with this later

  JSON.parse(error.message).forEach((err) => {
    toast.error(err.message);
  });
}
