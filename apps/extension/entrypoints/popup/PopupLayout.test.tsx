import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PopupLayout } from "./PopupLayout";

describe("extension popup layout", () => {
  it("stretches its middle content across the square minimum", () => {
    const markup = renderToStaticMarkup(
      <PopupLayout footer={<div>Footer</div>}>
        <div>Content</div>
      </PopupLayout>,
    );

    expect(markup).toContain("flex min-h-[380px] flex-col");
    expect(markup).toContain("flex flex-1 flex-col");
    expect(markup).toContain("sticky bottom-0");
    expect(markup).not.toContain("min-h-full");
  });
});
