interface CombinedAbortSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

export function combineAbortSignals(
  signals: readonly AbortSignal[],
): CombinedAbortSignal {
  if (typeof AbortSignal.any === "function") {
    return {
      signal: AbortSignal.any([...signals]),
      cleanup: () => undefined,
    };
  }

  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();
  const cleanup = () => {
    for (const [signal, listener] of listeners) {
      signal.removeEventListener("abort", listener);
    }
    listeners.clear();
  };

  for (const signal of signals) {
    if (signal.aborted) {
      cleanup();
      controller.abort(signal.reason);
      break;
    }

    const forwardAbort = () => {
      cleanup();
      controller.abort(signal.reason);
    };
    listeners.set(signal, forwardAbort);
    signal.addEventListener("abort", forwardAbort, { once: true });
  }

  return { signal: controller.signal, cleanup };
}
