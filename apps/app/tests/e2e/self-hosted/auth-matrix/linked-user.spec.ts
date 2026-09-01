import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../../fixtures/ports";
import {
  cleanupAtprotoConnection,
  cleanupUser,
  generateTestEmail,
  getAtprotoLinkState,
  seedAtprotoLink,
  seedAtprotoOnlyUser,
} from "../../fixtures/seed-db";
import { seedSession, signIn, signOut, signUp } from "../../fixtures/auth";
import type { Page } from "@playwright/test";

/**
 * Matrix cells for the linked-either-method user shape, on the
 * ConnectionsDialog surface: link entry, seeded link status, credential
 * sign-in alongside the link, unlink, and the sole-enabled-method unlink
 * guard. The full authorize round trip needs a real authorization server,
 * so the link state is seeded directly (the rows the link callback leaves
 * behind) and the dialog + unlink flow run end to end against the real app
 * server; the handle typeahead runs against the stub AppView.
 */

async function openConnections(page: Page, userName: string) {
  // The left sidebar is offcanvas until opened, and a pre-hydration
  // click on the toggle is swallowed — retry until the user menu is
  // actually reachable.
  const userButton = page
    .getByRole("button", { name: new RegExp(userName) })
    .first();
  const userButtonInViewport = async () => {
    const box = await userButton.boundingBox();
    return !!box && box.x >= 0;
  };
  await expect(async () => {
    if (!(await userButtonInViewport())) {
      await page.getByRole("button", { name: "Menu" }).click();
    }
    await expect(userButton).toBeInViewport({ timeout: 2000 });
  }).toPass({ timeout: 20000, intervals: [500, 1000, 2000] });
  await userButton.click();
  await page.getByRole("menuitem", { name: "Connections" }).click();
  await expect(page.getByText("Manage your connected services")).toBeVisible();
}

async function clearQueryCache(page: Page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
    } catch {
      // localStorage may not be available in some contexts
    }
  });
}

test.describe("atproto connection management", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;
  let did: string;

  test.afterEach(async () => {
    if (did) {
      await cleanupAtprotoConnection(SELF_HOSTED_TURSO_PORT, did);
    }
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("connection row, seeded link status, credential sign-in, and disconnect", async ({
    page,
  }) => {
    test.setTimeout(90000);
    testEmail = generateTestEmail();
    did = `did:plc:e2e${randomBytes(6).toString("hex")}`;
    const handle = "linked.example.com";
    const password = "password123";

    await signUp({
      page,
      name: "Atmosphere Tester",
      email: testEmail,
      password,
    });

    // Not yet linked: the Atmosphere row is configured and clickable, and
    // opens the handle entry form.
    await openConnections(page, "Atmosphere Tester");
    const atmosphereRow = page
      .locator("div")
      .filter({ has: page.getByText("Atmosphere", { exact: true }) })
      .filter({ hasText: "Not connected" })
      .last();
    await expect(atmosphereRow).toBeVisible();
    await atmosphereRow.click();
    await expect(page.getByLabel("Handle")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect" })).toBeDisabled();
    await page.keyboard.press("Escape");

    // Linked (seeded): the row shows the current handle with a disconnect
    // affordance.
    await seedAtprotoLink(SELF_HOSTED_TURSO_PORT, testEmail, { did, handle });

    // Linked-either-method: the credential half keeps working alongside
    // the link — a fresh password sign-in lands in the app and sees the
    // linked state.
    await signOut(page);
    await signIn({ page, email: testEmail, password });
    await clearQueryCache(page);
    await page.reload();
    await openConnections(page, "Atmosphere Tester");
    // The persisted-cache restore can serve the stale "not connected"
    // status first; the on-mount refetch replaces it (slowly under
    // parallel-worker load).
    await expect(page.getByText(handle)).toBeVisible({ timeout: 15000 });

    // Disconnect: removes the sign-in method and destroys the credential
    // material even though the seeded blob is unreadable ciphertext.
    // Allowed here because the credential method remains.
    await page
      .getByRole("button", { name: /disconnect/i })
      .first()
      .click();
    await expect(page.getByText("Atmosphere account disconnected")).toBeVisible(
      { timeout: 10000 },
    );
    await expect(page.getByText("Not connected").first()).toBeVisible();

    await expect
      .poll(async () => getAtprotoLinkState(SELF_HOSTED_TURSO_PORT, did))
      .toMatchObject({
        accountRowCount: 0,
        connection: { userId: null, status: "disconnected", session: null },
      });
  });

  test("handle typeahead suggests accounts and threads the selected DID", async ({
    page,
  }) => {
    test.setTimeout(60000);
    testEmail = generateTestEmail();
    did = "";

    await signUp({
      page,
      name: "Typeahead Tester",
      email: testEmail,
      password: "password123",
    });

    await openConnections(page, "Typeahead Tester");
    await page
      .locator("div")
      .filter({ has: page.getByText("Atmosphere", { exact: true }) })
      .filter({ hasText: "Not connected" })
      .last()
      .click();

    // Two characters are enough to surface stub-AppView suggestions; the
    // same shared field the auth pages use drives the link form.
    const handleInput = page.getByLabel("Handle");
    await handleInput.fill("al");
    const suggestions = page.getByLabel("Suggested accounts");
    await expect(suggestions.getByText("Alice Test")).toBeVisible();
    await expect(suggestions.getByText("alice.test")).toBeVisible();

    // Escape dismisses only the suggestions; the dialog stays up (the
    // popup is not a Radix layer, so the dialog is told to ignore that
    // Escape explicitly).
    await handleInput.press("Escape");
    await expect(suggestions).not.toBeVisible();
    await expect(
      page.getByText("Connect your Atmosphere account"),
    ).toBeVisible();

    // Escape during the debounce window — popup closed, search pending —
    // dismisses the pending search rather than the dialog too.
    await handleInput.fill("alic");
    await handleInput.press("Escape");
    await expect(
      page.getByText("Connect your Atmosphere account"),
    ).toBeVisible();

    // Typing again reopens the suggestions.
    await handleInput.fill("ali");
    await expect(suggestions.getByText("Alice Test")).toBeVisible();

    // Selecting swaps the input for the chosen account's card and threads
    // the DID into the link start as a resolution shortcut.
    await suggestions.getByText("Alice Test").click();
    await expect(
      page.getByRole("button", { name: "Choose a different account" }),
    ).toBeVisible();
    await expect(suggestions).not.toBeVisible();

    // Selection moves focus to the submit button, so Enter submits via
    // the button's native activation.
    const connectButton = page.getByRole("button", { name: "Connect" });
    await expect(connectButton).toBeFocused();

    const linkRequest = page.waitForRequest(
      (request) => request.url().includes("/api/rpc/atproto/linkAccount"),
      { timeout: 10_000 },
    );
    await connectButton.press("Enter");
    const request = await linkRequest;
    expect(request.postData()).toContain("alice.test");
    expect(request.postData()).toContain("did:plc:e2e-alice");
  });

  test("the sole-enabled-method guard blocks a DID-only user's disconnect", async ({
    page,
  }) => {
    test.setTimeout(60000);
    testEmail = "";
    did = "did:plc:e2e-sole-method-user";

    const seeded = await seedAtprotoOnlyUser(SELF_HOSTED_TURSO_PORT, {
      did,
      handle: "solemethod.test",
      name: "Sole Method User",
    });
    testEmail = seeded.email;

    await seedSession({
      page,
      tursoPort: SELF_HOSTED_TURSO_PORT,
      userId: seeded.userId,
      baseUrl: `http://localhost:${SELF_HOSTED_APP_PORT}`,
    });
    await page.goto("/");

    await openConnections(page, "Sole Method User");
    await expect(page.getByText("solemethod.test")).toBeVisible({
      timeout: 15000,
    });

    // Atmosphere is this account's only enabled sign-in method, so the
    // disconnect is refused server-side and the link survives.
    await page
      .getByRole("button", { name: /disconnect/i })
      .first()
      .click();
    await expect(
      page.getByText(
        "Atmosphere is your only way to sign in. Add a password before disconnecting it.",
      ),
    ).toBeVisible({ timeout: 10000 });

    await expect
      .poll(async () => getAtprotoLinkState(SELF_HOSTED_TURSO_PORT, did))
      .toMatchObject({
        accountRowCount: 1,
        connection: { status: "active" },
      });
  });
});
