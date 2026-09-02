// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoShortcuts } from "~/components/CustomVideoPlayer/useYouTubeVideoShortcuts";

const mocks = vi.hoisted(() => ({
  toggleVideoPlayback: vi.fn(),
  changeVideoPlaybackSpeed: vi.fn(),
  seekToSecond: vi.fn(),
  toggleCaptions: vi.fn(),
  toggleNativeFullscreen: vi.fn(),
  toggleMute: vi.fn(),
  setView: vi.fn(),
  toggleView: vi.fn(),
}));

vi.mock("~/components/CustomVideoPlayer/CustomVideoPlayerProvider", () => ({
  useCustomVideoPlayerContext: () => ({
    toggleVideoPlayback: mocks.toggleVideoPlayback,
    playerState: "playing",
    playbackSpeed: 1,
    changeVideoPlaybackSpeed: mocks.changeVideoPlaybackSpeed,
    videoDuration: 100,
    seekToSecond: mocks.seekToSecond,
    videoProgress: 50,
    captionsModuleLoaded: true,
    toggleCaptions: mocks.toggleCaptions,
    toggleNativeFullscreen: mocks.toggleNativeFullscreen,
    isNativeFullscreen: false,
    toggleMute: mocks.toggleMute,
  }),
}));

vi.mock("~/components/feed/watch/[id]/useView", () => ({
  useView: () => ({
    view: "default",
    setView: mocks.setView,
    toggleView: mocks.toggleView,
  }),
}));

vi.mock("~/lib/doesAnyFormElementHaveFocus", () => ({
  doesAnyFormElementHaveFocus: () => false,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Array<ReturnType<typeof createRoot>> = [];

function mountVideoShortcuts() {
  function VideoShortcutHarness() {
    useVideoShortcuts();
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(createElement(VideoShortcutHarness));
  });
}

function releaseKey(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keyup", { cancelable: true, ...init }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "platform", {
    value: "MacIntel",
    configurable: true,
  });
  mountVideoShortcuts();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

describe("useVideoShortcuts", () => {
  it("toggles mute on m", () => {
    releaseKey({ key: "m", code: "KeyM" });

    expect(mocks.toggleMute).toHaveBeenCalledTimes(1);
  });

  it("toggles mute while Alt composes the key on macOS", () => {
    releaseKey({ key: "µ", code: "KeyM", altKey: true });

    expect(mocks.toggleMute).toHaveBeenCalledTimes(1);
  });

  it("enters fullscreen on f while Alt is held", () => {
    releaseKey({ key: "ƒ", code: "KeyF", altKey: true });

    expect(mocks.toggleNativeFullscreen).toHaveBeenCalledTimes(1);
  });

  it("changes playback speed on Shift+> while Alt is held", () => {
    // German mac-style composition of Shift+Period under Option.
    releaseKey({ key: "˘", code: "Period", altKey: true, shiftKey: true });

    expect(mocks.changeVideoPlaybackSpeed).toHaveBeenCalledTimes(1);
  });

  it("still ignores keys behind Ctrl and Meta", () => {
    releaseKey({ key: "m", code: "KeyM", ctrlKey: true });
    releaseKey({ key: "m", code: "KeyM", metaKey: true });

    expect(mocks.toggleMute).not.toHaveBeenCalled();
  });
});
