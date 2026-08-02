export const EXTENSION_RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

export function extensionJsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return Response.json(body, {
    status,
    headers: EXTENSION_RESPONSE_HEADERS,
  });
}

export function extensionPreflightResponse(methods: string[]) {
  return new Response(null, {
    status: 204,
    headers: {
      ...EXTENSION_RESPONSE_HEADERS,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function readBoundedJson(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RangeError("request_too_large");
  }
  if (!request.body) throw new SyntaxError("invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    bytes += result.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new RangeError("request_too_large");
    }
    chunks.push(result.value);
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
}

export async function prepareExtensionJsonRequest<TUser>(input: {
  request: Request;
  maxBytes: number;
  requestLabel: string;
  authenticate: (request: Request) => Promise<TUser | null>;
}) {
  if (input.request.headers.has("content-encoding")) {
    return {
      ok: false as const,
      response: extensionJsonResponse(
        { error: "Request content encodings are not allowed" },
        415,
      ),
    };
  }
  const mediaType = input.request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return {
      ok: false as const,
      response: extensionJsonResponse(
        { error: "Content-Type must be application/json" },
        415,
      ),
    };
  }

  const user = await input.authenticate(input.request);
  if (!user) {
    return {
      ok: false as const,
      response: extensionJsonResponse(
        { error: "The extension session is invalid" },
        401,
      ),
    };
  }

  try {
    return {
      ok: true as const,
      user,
      body: await readBoundedJson(input.request, input.maxBytes),
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        ok: false as const,
        response: extensionJsonResponse(
          { error: `The ${input.requestLabel} request is too large` },
          413,
        ),
      };
    }
    return {
      ok: false as const,
      response: extensionJsonResponse(
        { error: `The ${input.requestLabel} request is invalid` },
        400,
      ),
    };
  }
}
