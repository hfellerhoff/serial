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
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(createElement(ShortcutHarness));
  });
}

function pressKey(init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
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

  it("fires punctuation shortcuts while Alt is held", () => {
    const openBracket = vi.fn();
    const backslash = vi.fn();
    mountShortcut("[", openBracket);
    mountShortcut("\\", backslash);

    pressKey({ key: "“", code: "BracketLeft", altKey: true });
    pressKey({ key: "«", code: "Backslash", altKey: true });

    expect(openBracket).toHaveBeenCalledTimes(1);
    expect(backslash).toHaveBeenCalledTimes(1);
  });

  it("fires the space shortcut when Option composes a non-breaking space", () => {
    const callback = vi.fn();
    mountShortcut(" ", callback);

    pressKey({ key: " ", code: "Space", altKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires a Shift combo shortcut with and without Alt held", () => {
    const callback = vi.fn();
    mountShortcut("Shift+F", callback);

    pressKey({ key: "F", code: "KeyF", shiftKey: true });
    pressKey({ key: "Ï", code: "KeyF", altKey: true, shiftKey: true });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("fires a shifted punctuation combo while Alt is held", () => {
    const callback = vi.fn();
    mountShortcut("Shift+|", callback);

    pressKey({ key: "»", code: "Backslash", altKey: true, shiftKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires a shortcut that explicitly binds Alt", () => {
    const callback = vi.fn();
    mountShortcut("Alt+e", callback);

    pressKey({ key: "´", code: "KeyE", altKey: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires a key sequence, including while Alt composes the keys", () => {
    const callback = vi.fn();
    mountShortcut("g+i", callback);

    pressKey({ key: "g", code: "KeyG" });
    pressKey({ key: "i", code: "KeyI" });

    // Option+G composes to "©" and Option+I is a dead key on macOS.
    pressKey({ key: "©", code: "KeyG", altKey: true });
    pressKey({ key: "Dead", code: "KeyI", altKey: true });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("keeps layout-aware keys when Alt does not compose them", () => {
    // German QWERTZ: the key labeled Y reports code KeyZ but key "y".
    const archive = vi.fn();
    const undo = vi.fn();
    mountShortcut("y", archive);
    mountShortcut("z", undo);

    pressKey({ key: "y", code: "KeyZ", altKey: true });

    expect(archive).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it("leaves numpad and named keys untouched while Alt is held", () => {
    const digit = vi.fn();
    const arrow = vi.fn();
    mountShortcut("1", digit);
    mountShortcut("ArrowDown", arrow);

    pressKey({ key: "1", code: "Numpad1", altKey: true });
    pressKey({ key: "ArrowDown", code: "ArrowDown", altKey: true });

    expect(digit).toHaveBeenCalledTimes(1);
    expect(arrow).toHaveBeenCalledTimes(1);
  });

  it("prevents the browser default only when firing with Alt held", () => {
    const callback = vi.fn();
    mountShortcut("e", callback);

    const plain = pressKey({ key: "e", code: "KeyE" });
    const withAlt = pressKey({ key: "e", code: "KeyE", altKey: true });

    expect(plain.defaultPrevented).toBe(false);
    expect(withAlt.defaultPrevented).toBe(true);
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
