// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useShortcut } from "~/lib/hooks/useShortcut";

vi.mock("~/components/feed/dialogStore", () => ({
  useDialogStore: (selector: (store: { dialog: null }) => unknown) =>
    selector({ dialog: null }),
}));

vi.mock("~/lib/doesAnyFormElementHaveFocus", () => ({
  doesAnyFormElementHaveFocus: () => false,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Array<ReturnType<typeof createRoot>> = [];

function mountShortcut(shortcut: string | string[], callback: () => void) {
  function ShortcutHarness() {
    useShortcut(shortcut, callback);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(createElement(ShortcutHarness));
  });
}

function pressKey(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", init));
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

describe("useShortcut", () => {
  it("fires a single-key shortcut without modifiers", () => {
    const callback = vi.fn();
    mountShortcut("e", callback);

    pressKey({ key: "e", code: "KeyE" });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires a single-key shortcut while Alt is held", () => {
    const callback = vi.fn();
    mountShortcut("e", callback);

    pressKey({ key: "e", code: "KeyE", altKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires while Alt is held even when macOS composes the key", () => {
    const callback = vi.fn();
    mountShortcut("e", callback);

    // On macOS, Option+E reports the composed character as `key`.
    pressKey({ key: "´", code: "KeyE", altKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires a digit shortcut while Alt is held", () => {
    const callback = vi.fn();
    mountShortcut("1", callback);

    pressKey({ key: "¡", code: "Digit1", altKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires a punctuation shortcut while Alt is held", () => {
    const callback = vi.fn();
    mountShortcut("[", callback);

    pressKey({ key: "“", code: "BracketLeft", altKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires a Shift combo shortcut while Alt is held", () => {
    const callback = vi.fn();
    mountShortcut("Shift+F", callback);

    pressKey({ key: "Ï", code: "KeyF", altKey: true, shiftKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("still blocks single-key shortcuts behind Ctrl and Meta", () => {
    const callback = vi.fn();
    mountShortcut("e", callback);

    pressKey({ key: "e", code: "KeyE", ctrlKey: true });
    pressKey({ key: "e", code: "KeyE", metaKey: true });
    pressKey({ key: "e", code: "KeyE", altKey: true, ctrlKey: true });

    expect(callback).not.toHaveBeenCalled();
  });

  it("still blocks Shift combos behind Ctrl and Meta", () => {
    const callback = vi.fn();
    mountShortcut("Shift+F", callback);

    pressKey({ key: "F", code: "KeyF", shiftKey: true, ctrlKey: true });
    pressKey({ key: "F", code: "KeyF", shiftKey: true, metaKey: true });

    expect(callback).not.toHaveBeenCalled();
  });
});
