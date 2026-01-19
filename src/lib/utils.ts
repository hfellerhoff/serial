import { clsx } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import type { ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleErrors(error: unknown) {
  // @ts-expect-error deal with this later

  JSON.parse(error.message).forEach((err) => {
    toast.error(err.message);
  });
}
