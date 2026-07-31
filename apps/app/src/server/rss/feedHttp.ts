export type FeedHttpReadOptions = {
  headers?: HeadersInit;
  maxBodyBytes?: number;
  maxHeaderBytes?: number;
  maxRedirects?: number;
  totalDurationMs?: number;
};

export type FeedHttpResponse = {
  headers: Headers;
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  url: string;
};

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_HEADER_BYTES = 32 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TOTAL_DURATION_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function assertHeadersWithinBudget(headers: Headers, maxHeaderBytes: number) {
  let headerBytes = 0;
  for (const [name, value] of headers) {
    headerBytes += Buffer.byteLength(name) + Buffer.byteLength(value);
    if (headerBytes > maxHeaderBytes) {
      throw new Error(`Feed response headers exceed ${maxHeaderBytes} bytes`);
    }
  }
}

async function fetchWithRedirectBudget(
  initialUrl: string,
  options: FeedHttpReadOptions,
  signal: AbortSignal,
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxHeaderBytes = options.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES;
  let requestUrl = initialUrl;

  for (let redirectCount = 0; ; redirectCount++) {
    const response = await fetch(requestUrl, {
      headers: options.headers,
      redirect: "manual",
      signal,
    });
    try {
      assertHeadersWithinBudget(response.headers, maxHeaderBytes);
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    if (redirectCount >= maxRedirects) {
      await response.body?.cancel();
      const redirectLabel = maxRedirects === 1 ? "redirect" : "redirects";
      throw new Error(`Feed request exceeded ${maxRedirects} ${redirectLabel}`);
    }

    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) {
      throw new Error("Feed redirect response is missing Location");
    }

    const redirectUrl = new URL(location, requestUrl);
    if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
      throw new Error("Feed redirect uses an unsupported protocol");
    }
    requestUrl = redirectUrl.toString();
  }
}

export async function readFeedHttp(
  url: string,
  options: FeedHttpReadOptions = {},
): Promise<FeedHttpResponse> {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const totalDurationMs = options.totalDurationMs ?? DEFAULT_TOTAL_DURATION_MS;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), totalDurationMs);

  try {
    const response = await fetchWithRedirectBudget(
      url,
      options,
      abortController.signal,
    );
    const declaredBodyBytes = Number(response.headers.get("content-length"));
    const responseMayHaveBody =
      response.status !== 204 &&
      response.status !== 205 &&
      response.status !== 304;
    if (
      responseMayHaveBody &&
      Number.isFinite(declaredBodyBytes) &&
      declaredBodyBytes > maxBodyBytes
    ) {
      await response.body?.cancel();
      throw new Error(
        `Feed response Content-Length exceeds ${maxBodyBytes} bytes`,
      );
    }
    const reader = response.body?.getReader();

    if (!reader) {
      return {
        headers: response.headers,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text: "",
        url: response.url,
      };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBodyBytes) {
        await reader.cancel();
        throw new Error(`Feed response body exceeds ${maxBodyBytes} bytes`);
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      headers: response.headers,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: new TextDecoder().decode(body),
      url: response.url,
    };
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(
        `Feed request exceeded ${totalDurationMs}ms total duration`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
