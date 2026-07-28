import { describe, expect, it } from "vitest";
import {
  EDGE_SCRIPT_CONFIG,
  handleOriginRequest,
  hasSessionCookie,
} from "../src/middleware";

function createRequest(
  url = "https://www.serial.tube/",
  cookie?: string,
): Request {
  return new Request(url, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("hasSessionCookie", () => {
  it.each(EDGE_SCRIPT_CONFIG.sessionCookieNames)(
    "recognizes a non-empty %s cookie",
    (cookieName) => {
      expect(
        hasSessionCookie(createRequest(undefined, `${cookieName}=token`)),
      ).toBe(true);
    },
  );

  it("ignores missing, empty, and similarly named cookies", () => {
    expect(hasSessionCookie(createRequest())).toBe(false);
    expect(
      hasSessionCookie(
        createRequest(
          undefined,
          "better-auth.session_token=; better-auth.session_token_backup=token",
        ),
      ),
    ).toBe(false);
  });
});

describe("handleOriginRequest", () => {
  it("redirects signed-in visitors from the www homepage", () => {
    const request = createRequest(
      "https://www.serial.tube/?utm_source=deployment-test",
      "__Secure-better-auth.session_token=token",
    );
    const result = handleOriginRequest(request);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("location")).toBe(
      EDGE_SCRIPT_CONFIG.appUrl,
    );
    expect((result as Response).headers.get("cache-control")).toBe(
      "private, no-store",
    );
  });

  it.each([
    ["a signed-out visitor", createRequest()],
    [
      "a non-homepage request",
      createRequest(
        "https://www.serial.tube/pricing",
        "better-auth.session_token=token",
      ),
    ],
    [
      "the apex hostname",
      createRequest("https://serial.tube/", "better-auth.session_token=token"),
    ],
    [
      "another subdomain",
      createRequest(
        "https://demo.serial.tube/",
        "better-auth.session_token=token",
      ),
    ],
  ])("passes through %s", (_description, request) => {
    expect(handleOriginRequest(request)).toBe(request);
  });
});
