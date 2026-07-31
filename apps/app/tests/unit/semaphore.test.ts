import { describe, expect, it } from "vitest";
import { getDatabaseConcurrencyLimit } from "~/lib/semaphore";

describe("database concurrency policy", () => {
  it("uses a finite ten-operation limit for hosted Turso", () => {
    expect(
      getDatabaseConcurrencyLimit("libsql://serial-example.turso.io"),
    ).toBe(10);
  });

  it("keeps the tighter five-operation limit for local databases", () => {
    expect(getDatabaseConcurrencyLimit("http://127.0.0.1:8082")).toBe(5);
  });
});
