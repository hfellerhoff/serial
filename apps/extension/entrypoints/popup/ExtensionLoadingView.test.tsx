import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import App from "./App";
import { BookmarkWorkspaceView } from "./BookmarkWorkspaceView";
import type { ExtensionAuthSession } from "../../lib/auth";

const session: ExtensionAuthSession = {
  version: 2,
  instance: "https://serial.example",
  token: "serial_ext_test",
  expiresAt: Date.now() + 60_000,
  user: { id: "user-one", name: "User" },
};

function expectCenteredLoadingView(markup: string) {
  expect(markup).toContain('role="status"');
  expect(markup).toContain('aria-label="Loading"');
  expect(markup).toContain("grid min-h-[380px] place-items-center");
  expect(markup).toContain("lucide-loader-circle");
  expect(markup).toContain("animate-spin");
  expect(markup).not.toContain("Serial");
  expect(markup).not.toContain("Bookmark");
  expect(markup).not.toContain("footer");
}

describe("extension unresolved startup view", () => {
  it("shows only a centered product spinner during session lookup", () => {
    expectCenteredLoadingView(renderToStaticMarkup(<App />));
  });

  it("keeps the same blank loading view during page classification", () => {
    expectCenteredLoadingView(
      renderToStaticMarkup(
        <BookmarkWorkspaceView
          session={session}
          signingOut={false}
          externalError={null}
          onSignOut={() => undefined}
          onAuthExpired={() => undefined}
        />,
      ),
    );
  });
});
