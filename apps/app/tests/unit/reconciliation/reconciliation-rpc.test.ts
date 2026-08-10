import { createRouterClient } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBookmarkTestDatabase } from "../bookmarks/database";
import type { ORPCContext } from "~/server/orpc/base";
import { user, views } from "~/server/db/schema";
import { orpcRouter } from "~/server/orpc/router";
import { MAX_RECONCILIATION_TARGETS } from "~/server/reconciliation/input";

const testState = vi.hoisted((): { database: unknown } => ({
  database: undefined,
}));

vi.mock("~/server/db", () => ({
  get db() {
    return testState.database;
  },
}));
vi.mock("~/server/auth", () => ({ auth: {} }));
vi.mock("~/env", () => ({
  env: {
    BACKGROUND_REFRESH_ENABLED: false,
    DATABASE_URL: "file::memory:",
    KV_STORE: "none",
    PUBLIC_BASE_URL: "http://localhost:3000",
    TRUSTED_ORIGINS: [],
  },
}));

type TestDatabase = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["database"];
type Cleanup = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["cleanup"];

const NOW = new Date("2026-08-10T12:00:00.000Z");

let database: TestDatabase;
let cleanup: Cleanup;

beforeEach(async () => {
  ({ database, cleanup } = await createBookmarkTestDatabase());
  testState.database = database;
  await database.insert(user).values({
    id: "rpc-user",
    name: "RPC user",
    email: "rpc@example.com",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await database.insert(views).values({
    id: 10,
    userId: "rpc-user",
    name: "Reading",
    contentFilter: 3,
    placement: 1,
  });
});

afterEach(() => cleanup());

function api() {
  return createRouterClient(orpcRouter, {
    context: {
      headers: new Headers(),
      session: { id: "rpc-session" },
      user: { id: "rpc-user" },
      db: database,
    } as ORPCContext,
  });
}

describe("reconciliation RPC", () => {
  it("streams the deep reconciliation interface through the authenticated transport", async () => {
    const stream = await api().initial.reconcileApplicationState({
      type: "full",
      reconciliationId: "rpc-cold",
      selection: {
        type: "cold",
        contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
        membershipRevision: 0,
      },
    });
    const chunkTypes: string[] = [];
    for await (const event of stream) chunkTypes.push(event.chunk.type);

    expect(chunkTypes).toEqual([
      "organization-snapshot",
      "domain-complete",
      "active-first-page",
      "domain-complete",
      "automatic-rss-owner",
      "navigation-snapshot",
      "domain-complete",
      "epoch-complete",
    ]);
  });

  it("rejects an oversized targeted request before server work begins", async () => {
    await expect(
      api().initial.reconcileApplicationState({
        type: "targeted",
        reconciliationId: "too-many-targets",
        targets: Array.from({ length: MAX_RECONCILIATION_TARGETS + 1 }, () => ({
          target: { type: "navigation" as const },
        })),
      }),
    ).rejects.toThrow();
  });
});
