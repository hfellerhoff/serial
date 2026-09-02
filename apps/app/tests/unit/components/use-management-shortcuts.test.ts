// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFeedManagementShortcuts } from "~/components/feed/useManagementShortcuts";

const mocks = vi.hoisted(() => ({
  onEscape: vi.fn(),
  onSelectAll: vi.fn(),
  onEdit: vi.fn(),
  onClear: vi.fn(),
  onDelete: vi.fn(),
}));

vi.mock("~/lib/data/offline-mutations", () => ({
  useCanMutate: () => true,
}));

vi.mock("~/lib/doesAnyFormElementHaveFocus", () => ({
  doesAnyFormElementHaveFocus: () => false,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Array<ReturnType<typeof createRoot>> = [];

function mountManagementShortcuts() {
  function ManagementShortcutHarness() {
    useFeedManagementShortcuts({
      onEscape: mocks.onEscape,
      onSelectAll: mocks.onSelectAll,
      onEdit: mocks.onEdit,
      onClear: mocks.onClear,
      onDelete: mocks.onDelete,
      isDialogOpen: false,
      hasSelection: true,
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(createElement(ManagementShortcutHarness));
  });
}

function pressKey(init: KeyboardEventInit) {
  // Dispatch from the body so `event.target` is a DOM element, as in a real
  // browser; the hook's window listener sees it through bubbling.
  const event = new KeyboardEvent("keydown", {
    cancelable: true,
    bubbles: true,
    ...init,
  });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "platform", {
    value: "MacIntel",
    configurable: true,
  });
  mountManagementShortcuts();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

describe("useFeedManagementShortcuts", () => {
  it("fires the plain shortcut keys", () => {
    pressKey({ key: "s", code: "KeyS" });
    pressKey({ key: "e", code: "KeyE" });
    pressKey({ key: "c", code: "KeyC" });
    pressKey({ key: "d", code: "KeyD" });

    expect(mocks.onSelectAll).toHaveBeenCalledTimes(1);
    expect(mocks.onEdit).toHaveBeenCalledTimes(1);
    expect(mocks.onClear).toHaveBeenCalledTimes(1);
    expect(mocks.onDelete).toHaveBeenCalledTimes(1);
  });

  it("fires while Alt composes the key on macOS and cancels the default", () => {
    const event = pressKey({ key: "ß", code: "KeyS", altKey: true });

    expect(mocks.onSelectAll).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("handles Escape while Alt is held without cancelling the default", () => {
    const event = pressKey({ key: "Escape", code: "Escape", altKey: true });

    expect(mocks.onEscape).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores keys behind Ctrl and Meta", () => {
    pressKey({ key: "s", code: "KeyS", metaKey: true });
    pressKey({ key: "s", code: "KeyS", ctrlKey: true });
    pressKey({ key: "d", code: "KeyD", metaKey: true });

    expect(mocks.onSelectAll).not.toHaveBeenCalled();
    expect(mocks.onDelete).not.toHaveBeenCalled();
  });
});
