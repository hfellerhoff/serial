import { z } from "zod";

/**
 * Input validation shared by the plugin's authorize endpoint and the oRPC
 * link procedure. The SDK's resolver accepts full URLs and would fetch
 * metadata from any host a caller names; sign-in and linking only ever need
 * a DID or a handle-shaped hostname, so everything else is rejected at the
 * edge.
 */

export const DID_PATTERN = /^did:[a-z]+:[a-zA-Z0-9._%:-]+$/;
export const HANDLE_PATTERN =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

export const didSchema = z
  .string()
  .trim()
  .max(512)
  .regex(DID_PATTERN, "Not a valid DID");

export const identifierSchema = z
  .string()
  .trim()
  .max(512)
  .refine(
    (value) => DID_PATTERN.test(value) || HANDLE_PATTERN.test(value),
    "Enter a handle like name.bsky.social or a DID",
  );
