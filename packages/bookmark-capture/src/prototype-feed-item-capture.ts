// PROTOTYPE: Ephemeral Feed-item capture. Keep this contract off production
// branches until the inactive-tab experiment has a clear verdict.

export const PROTOTYPE_FEED_ITEM_CAPTURE_REQUEST =
  "prototype.feed-item-capture.request" as const;
export const PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE =
  "prototype.feed-item-capture.response" as const;

export type PrototypeFeedItemCaptureRequest = {
  type: typeof PROTOTYPE_FEED_ITEM_CAPTURE_REQUEST;
  requestId: string;
  sourceUrl: string;
};

export type PrototypeFeedItemCaptureResponse =
  | {
      type: typeof PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE;
      requestId: string;
      ok: true;
      capture: {
        contentHtml: string;
        effectiveUrl: string;
        title: string;
      };
    }
  | {
      type: typeof PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE;
      requestId: string;
      ok: false;
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPrototypeFeedItemCaptureRequest(
  value: unknown,
): value is PrototypeFeedItemCaptureRequest {
  return (
    isRecord(value) &&
    value.type === PROTOTYPE_FEED_ITEM_CAPTURE_REQUEST &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    typeof value.sourceUrl === "string"
  );
}

export function parsePrototypeFeedItemCaptureResponse(
  value: unknown,
  requestId: string,
): PrototypeFeedItemCaptureResponse | null {
  if (
    !isRecord(value) ||
    value.type !== PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE ||
    value.requestId !== requestId ||
    typeof value.ok !== "boolean"
  ) {
    return null;
  }
  if (!value.ok) {
    return typeof value.error === "string"
      ? {
          type: PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
          requestId,
          ok: false,
          error: value.error,
        }
      : null;
  }
  if (!isRecord(value.capture)) return null;
  const { contentHtml, effectiveUrl, title } = value.capture;
  if (
    typeof contentHtml !== "string" ||
    contentHtml.length === 0 ||
    typeof effectiveUrl !== "string" ||
    typeof title !== "string"
  ) {
    return null;
  }
  return {
    type: PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
    requestId,
    ok: true,
    capture: { contentHtml, effectiveUrl, title },
  };
}
