import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import {
  readExtensionBearerToken,
  validateExtensionCodeChallenge,
} from "~/lib/extension-auth";
import { auth } from "~/server/auth";
import {
  exchangeExtensionGrant,
  findExtensionSession,
  InvalidExtensionGrantError,
  issueExtensionGrant,
  revokeExtensionSession,
  validateExtensionRedirectUri,
} from "~/server/auth/extension";
import { TRUSTED_ORIGINS_SET } from "~/server/auth/constants";
import { parseHSL } from "~/server/api/routers/hsl";
import { db } from "~/server/db";
import { user, userConfig } from "~/server/db/schema";

const MAX_REQUEST_BODY_LENGTH = 2_048;
const CONNECTION_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EXTENSION_AUTH_PATHS = {
  approve: "/api/extension-auth/approve",
  exchange: "/api/extension-auth/exchange",
  session: "/api/extension-auth/session",
} as const;

class InvalidRequestError extends Error {}

function extensionResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function preflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function readRequestBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BODY_LENGTH
  ) {
    throw new InvalidRequestError("The request is too large");
  }
  const text = await request.text();
  if (!text || text.length > MAX_REQUEST_BODY_LENGTH) {
    throw new InvalidRequestError("The request is invalid");
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new InvalidRequestError("The request is invalid");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InvalidRequestError) throw error;
    throw new InvalidRequestError("The request is invalid");
  }
}

function requiredString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getTrustedApprovalOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const normalizedOrigin = new URL(origin).origin;
    return normalizedOrigin === origin && TRUSTED_ORIGINS_SET.has(origin)
      ? origin
      : null;
  } catch {
    return null;
  }
}

function buildCallback(
  redirectUri: string,
  parameters: Record<string, string>,
) {
  const callback = new URL(redirectUri);
  callback.search = new URLSearchParams(parameters).toString();
  return callback.toString();
}

async function getExtensionUser(userId: string) {
  const [authenticatedUser, config] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, userId) }),
    db.query.userConfig.findFirst({ where: eq(userConfig.userId, userId) }),
  ]);
  if (!authenticatedUser) return null;
  const activeBan =
    authenticatedUser.banned &&
    (!authenticatedUser.banExpires ||
      authenticatedUser.banExpires.getTime() > Date.now());
  if (activeBan) return null;

  const lightHSL = parseHSL(config?.lightHSL);
  const darkHSL = parseHSL(config?.darkHSL);
  return {
    id: authenticatedUser.id,
    name: authenticatedUser.name,
    ...(authenticatedUser.image ? { picture: authenticatedUser.image } : {}),
    ...((lightHSL || darkHSL) && {
      theme: {
        ...(lightHSL ? { lightHSL } : {}),
        ...(darkHSL ? { darkHSL } : {}),
      },
    }),
  };
}

async function approveExtension(request: Request) {
  const issuer = getTrustedApprovalOrigin(request);
  if (!issuer) {
    return extensionResponse(
      { error: "The approval origin is not trusted" },
      403,
    );
  }

  const authenticated = await auth.api.getSession({ headers: request.headers });
  if (!authenticated) {
    return extensionResponse(
      { error: "Sign in before connecting the extension" },
      401,
    );
  }

  try {
    const body = await readRequestBody(request);
    const action =
      body.action === "approve" || body.action === "deny" ? body.action : null;
    const redirectUriValue = requiredString(body.redirectUri);
    const state = requiredString(body.state);
    const codeChallengeValue = requiredString(body.codeChallenge);
    if (
      !action ||
      !redirectUriValue ||
      !state ||
      !CONNECTION_STATE_PATTERN.test(state) ||
      !codeChallengeValue
    ) {
      throw new InvalidRequestError("The connection request is invalid");
    }
    const redirectUri = validateExtensionRedirectUri(redirectUriValue);
    const codeChallenge = validateExtensionCodeChallenge(codeChallengeValue);

    if (action === "deny") {
      return extensionResponse({
        redirectUrl: buildCallback(redirectUri, {
          error: "access_denied",
          state,
          iss: issuer,
        }),
      });
    }

    const grant = await issueExtensionGrant({
      userId: authenticated.user.id,
      redirectUri,
      codeChallenge,
      issuer,
    });
    return extensionResponse({
      redirectUrl: buildCallback(redirectUri, {
        code: grant.code,
        state,
        iss: issuer,
      }),
    });
  } catch (error) {
    return extensionResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to connect the extension",
      },
      400,
    );
  }
}

async function exchangeGrant(request: Request) {
  try {
    const body = await readRequestBody(request);
    const code = requiredString(body.code);
    const codeVerifier = requiredString(body.codeVerifier);
    const redirectUri = requiredString(body.redirectUri);
    if (!code || !codeVerifier || !redirectUri) {
      throw new InvalidRequestError("The extension grant is invalid");
    }
    const exchanged = await exchangeExtensionGrant({
      code,
      codeVerifier,
      redirectUri,
    });
    const extensionUser = await getExtensionUser(exchanged.userId);
    if (!extensionUser) {
      await revokeExtensionSession(exchanged.token);
      return extensionResponse(
        { error: "The Serial account no longer exists" },
        401,
      );
    }
    return extensionResponse({
      token: exchanged.token,
      expiresAt: exchanged.expiresAt.getTime(),
      user: extensionUser,
    });
  } catch (error) {
    return extensionResponse(
      {
        error:
          error instanceof InvalidExtensionGrantError
            ? error.message
            : "Unable to exchange the extension grant",
      },
      error instanceof InvalidRequestError ||
        error instanceof InvalidExtensionGrantError
        ? 400
        : 500,
    );
  }
}

async function readSession(request: Request) {
  const token = readExtensionBearerToken(request);
  if (!token) {
    return extensionResponse(
      { error: "The extension session is invalid" },
      401,
    );
  }
  const storedSession = await findExtensionSession(token);
  if (!storedSession) {
    return extensionResponse(
      { error: "The extension session is invalid" },
      401,
    );
  }
  const extensionUser = await getExtensionUser(storedSession.userId);
  if (!extensionUser) {
    await revokeExtensionSession(token);
    return extensionResponse(
      { error: "The Serial account no longer exists" },
      401,
    );
  }
  return extensionResponse({
    expiresAt: storedSession.expiresAt.getTime(),
    user: extensionUser,
  });
}

async function deleteSession(request: Request) {
  const token = readExtensionBearerToken(request);
  if (token) await revokeExtensionSession(token);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/extension-auth/$")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === EXTENSION_AUTH_PATHS.approve) {
          return approveExtension(request);
        }
        if (pathname === EXTENSION_AUTH_PATHS.exchange) {
          return exchangeGrant(request);
        }
        return extensionResponse({ error: "Not found" }, 404);
      },
      GET: ({ request }) => {
        return new URL(request.url).pathname === EXTENSION_AUTH_PATHS.session
          ? readSession(request)
          : extensionResponse({ error: "Not found" }, 404);
      },
      DELETE: ({ request }) => {
        return new URL(request.url).pathname === EXTENSION_AUTH_PATHS.session
          ? deleteSession(request)
          : extensionResponse({ error: "Not found" }, 404);
      },
      OPTIONS: () => preflightResponse(),
    },
  },
});
