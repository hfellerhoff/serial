import { describe, expect, it } from "vitest";
import { reconcileRenderCountForItems } from "~/lib/hooks/useItemWindow";

describe("item window", () => {
  it("reveals late initial-page arrivals within the render budget", () => {
    expect(
      reconcileRenderCountForItems({
        currentRenderCount: 1,
        itemCount: 2,
        renderBudget: 30,
      }),
    ).toBe(2);
  });

  it("does not automatically reveal later pagination", () => {
    expect(
      reconcileRenderCountForItems({
        currentRenderCount: 30,
        itemCount: 60,
        renderBudget: 30,
      }),
    ).toBe(30);
  });

  it("preserves a window the user already expanded", () => {
    expect(
      reconcileRenderCountForItems({
        currentRenderCount: 60,
        itemCount: 90,
        renderBudget: 30,
      }),
    ).toBe(60);
  });
});
