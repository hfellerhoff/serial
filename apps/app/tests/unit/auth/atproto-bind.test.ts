import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import { atprotoConnections, user } from "~/server/db/schema";

/**
 * The guarded connection binding: a callback must never steal a DID
 * already bound to a different user, and a vanished row must fail loudly
 * (the plugin converts the throw into an auth-level error redirect so the
 * post-auth policy hook still runs).
 */

const dbHolder = vi.hoisted(() => {
  const holder: { current: unknown } = { current: undefined };
  return holder;
});

vi.mock("~/server/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

const { bindAtprotoConnection } = await import("~/server/auth/atproto/service");

type Session = ReturnType<typeof openBenchmarkDatabase>;
type Target = ReturnType<typeof createLocalBenchmarkTarget>;

const DID = "did:plc:bindme";

describe("bindAtprotoConnection", () => {
  let session: Session;
  let target: Target;

  beforeEach(async () => {
    target = createLocalBenchmarkTarget();
    session = openBenchmarkDatabase({ url: target.url });
    await applyMigrations(session.baseClient);
    dbHolder.current = session.database;

    for (const id of ["user-1", "user-2"]) {
      await session.database.insert(user).values({
        id,
        name: id,
        email: `${id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await session.database.insert(atprotoConnections).values({
      did: DID,
      scopes: "atproto",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    session.close();
    target.cleanup();
    dbHolder.current = undefined;
  });

  async function boundUser() {
    const rows = await session.database.select().from(atprotoConnections).all();
    return rows[0]?.userId ?? null;
  }

  it("binds an unbound connection", async () => {
    await bindAtprotoConnection(DID, "user-1");
    expect(await boundUser()).toBe("user-1");
  });

  it("re-binding the same user is a no-op success", async () => {
    await bindAtprotoConnection(DID, "user-1");
    await expect(bindAtprotoConnection(DID, "user-1")).resolves.toBeUndefined();
    expect(await boundUser()).toBe("user-1");
  });

  it("refuses to steal a connection bound to another user", async () => {
    await bindAtprotoConnection(DID, "user-1");
    await expect(bindAtprotoConnection(DID, "user-2")).rejects.toThrow(
      /No bindable atproto connection/,
    );
    expect(await boundUser()).toBe("user-1");
  });

  it("fails loudly when the connection row does not exist", async () => {
    await expect(
      bindAtprotoConnection("did:plc:missing", "user-1"),
    ).rejects.toThrow(/No bindable atproto connection/);
  });
});
