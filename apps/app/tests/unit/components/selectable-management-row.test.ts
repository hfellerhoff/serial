import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SelectableManagementRow } from "~/components/feed/SelectableManagementRow";

function containsNestedButton(markup: string) {
  const buttonTags = markup.matchAll(/<\/?button\b[^>]*>/g);
  let openButtonCount = 0;

  for (const match of buttonTags) {
    const tag = match[0];
    if (tag.startsWith("</")) {
      openButtonCount -= 1;
      continue;
    }
    if (openButtonCount > 0) return true;
    openButtonCount += 1;
  }

  return false;
}

describe("SelectableManagementRow", () => {
  test("keeps selection, checkbox, and action buttons as siblings", () => {
    const markup = renderToStaticMarkup(
      createElement(SelectableManagementRow, {
        title: "News",
        selectionLabel: "Select view News",
        selected: false,
        leading: createElement("button", { type: "button" }, "Select News"),
        action: createElement("button", { type: "button" }, "Edit News"),
        onSelect: () => undefined,
      }),
    );

    expect(containsNestedButton(markup)).toBe(false);
  });
});
