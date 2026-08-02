import { describe, expect, it } from "vitest";
import {
  bookmarkMembershipChange,
  BookmarkMutationCoordinator,
} from "@serial/bookmark-capture";

type Bookmark = {
  id: string;
  viewIds: number[];
  tagIds: number[];
};

const bookmark = (viewIds: number[] = [], tagIds: number[] = []): Bookmark => ({
  id: "bookmark-one",
  viewIds,
  tagIds,
});

describe("Bookmark optimistic mutation coordination", () => {
  it("preserves a newer settled Tag response when an older View response arrives last", () => {
    const coordinator = new BookmarkMutationCoordinator<Bookmark>();
    const view = coordinator.begin("bookmark-one", [
      bookmarkMembershipChange("view", 1, true),
    ]);
    const tag = coordinator.begin("bookmark-one", [
      bookmarkMembershipChange("tag", 2, true),
    ]);
    let current = coordinator.apply(bookmark(), view);
    current = coordinator.apply(current, tag);

    current = coordinator.reconcile(current, bookmark([1], [2]), tag);
    current = coordinator.reconcile(current, bookmark([1], []), view);

    expect(current).toEqual(bookmark([1], [2]));
  });

  it("keeps the latest intent for two requests touching the same membership", () => {
    const coordinator = new BookmarkMutationCoordinator<Bookmark>();
    const add = coordinator.begin("bookmark-one", [
      bookmarkMembershipChange("view", 1, true),
    ]);
    const remove = coordinator.begin("bookmark-one", [
      bookmarkMembershipChange("view", 1, false),
    ]);
    let current = coordinator.apply(bookmark(), add);
    current = coordinator.apply(current, remove);

    current = coordinator.reconcile(current, bookmark(), remove);
    current = coordinator.reconcile(current, bookmark([1]), add);

    expect(current).toEqual(bookmark());
  });

  it("does not roll a newer optimistic membership back when an older request fails", () => {
    const coordinator = new BookmarkMutationCoordinator<Bookmark>();
    const initial = bookmark();
    const addView = coordinator.begin("bookmark-one", [
      bookmarkMembershipChange("view", 1, true),
    ]);
    let current = coordinator.apply(initial, addView);
    const addTag = coordinator.begin("bookmark-one", [
      bookmarkMembershipChange("tag", 2, true),
    ]);
    const beforeTag = current;
    current = coordinator.apply(current, addTag);

    current = coordinator.rollback(current, beforeTag, addTag);

    expect(current).toEqual(bookmark([1]));
  });
});
