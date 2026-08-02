export type BookmarkMutationRecord = {
  id: string;
  viewIds: number[];
  tagIds: number[];
};

export type BookmarkOptimisticChange<T extends BookmarkMutationRecord> = {
  key: string;
  apply: (bookmark: T) => T;
  restore: (bookmark: T, previousBookmark: T) => T;
};

export type BookmarkMutationToken<T extends BookmarkMutationRecord> = {
  bookmarkId: string;
  sequence: number;
  changes: BookmarkOptimisticChange<T>[];
};

type LatestChange<T extends BookmarkMutationRecord> = {
  sequence: number;
  change: BookmarkOptimisticChange<T>;
};

export function bookmarkMembershipChange<T extends BookmarkMutationRecord>(
  kind: "view" | "tag",
  id: number,
  assigned: boolean,
): BookmarkOptimisticChange<T> {
  const property = kind === "view" ? "viewIds" : "tagIds";
  const applyValue = (bookmark: T, shouldBeAssigned: boolean) => {
    const values = bookmark[property];
    return {
      ...bookmark,
      [property]: shouldBeAssigned
        ? values.includes(id)
          ? values
          : [...values, id]
        : values.filter((value) => value !== id),
    };
  };
  return {
    key: `${kind}:${id}`,
    apply: (bookmark) => applyValue(bookmark, assigned),
    restore: (bookmark, previousBookmark) =>
      applyValue(bookmark, previousBookmark[property].includes(id)),
  };
}

export function bookmarkPropertiesChange<T extends BookmarkMutationRecord>(
  key: string,
  patch: Partial<T>,
  properties: Array<keyof T>,
): BookmarkOptimisticChange<T> {
  return {
    key,
    apply: (bookmark) => ({ ...bookmark, ...patch }),
    restore: (bookmark, previousBookmark) => {
      const restored = { ...bookmark };
      for (const property of properties) {
        restored[property] = previousBookmark[property];
      }
      return restored;
    },
  };
}

export class BookmarkMutationCoordinator<T extends BookmarkMutationRecord> {
  private sequence = 0;
  private readonly pending = new Map<
    string,
    Map<number, BookmarkMutationToken<T>>
  >();
  private readonly latest = new Map<string, Map<string, LatestChange<T>>>();

  begin(
    bookmarkId: string,
    changes: BookmarkOptimisticChange<T>[],
  ): BookmarkMutationToken<T> {
    const token = { bookmarkId, sequence: ++this.sequence, changes };
    const pending = this.pending.get(bookmarkId) ?? new Map();
    pending.set(token.sequence, token);
    this.pending.set(bookmarkId, pending);
    const latest = this.latest.get(bookmarkId) ?? new Map();
    for (const change of changes) {
      latest.set(change.key, { sequence: token.sequence, change });
    }
    this.latest.set(bookmarkId, latest);
    return token;
  }

  apply(bookmark: T, token: BookmarkMutationToken<T>) {
    return token.changes.reduce(
      (current, change) => change.apply(current),
      bookmark,
    );
  }

  reconcile(
    currentBookmark: T,
    serverBookmark: T,
    token: BookmarkMutationToken<T>,
  ) {
    const pending = this.pending.get(token.bookmarkId);
    pending?.delete(token.sequence);
    const pendingSequences = new Set(pending?.keys() ?? []);
    let merged = serverBookmark;
    for (const latest of this.latest.get(token.bookmarkId)?.values() ?? []) {
      if (
        latest.sequence > token.sequence ||
        pendingSequences.has(latest.sequence)
      ) {
        merged = latest.change.apply(merged);
      }
    }
    this.cleanup(token.bookmarkId);
    void currentBookmark;
    return merged;
  }

  rollback(
    currentBookmark: T,
    previousBookmark: T,
    token: BookmarkMutationToken<T>,
  ) {
    const pending = this.pending.get(token.bookmarkId);
    pending?.delete(token.sequence);
    const latest = this.latest.get(token.bookmarkId);
    let rolledBack = currentBookmark;

    for (const change of token.changes) {
      if (latest?.get(change.key)?.sequence !== token.sequence) continue;
      const previousPending = [...(pending?.values() ?? [])]
        .flatMap((candidate) =>
          candidate.changes.map((pendingChange) => ({
            sequence: candidate.sequence,
            change: pendingChange,
          })),
        )
        .filter((candidate) => candidate.change.key === change.key)
        .sort((left, right) => right.sequence - left.sequence)[0];
      if (previousPending) {
        latest.set(change.key, previousPending);
      } else {
        latest.delete(change.key);
        rolledBack = change.restore(rolledBack, previousBookmark);
      }
    }

    for (const latestChange of latest?.values() ?? []) {
      if (pending?.has(latestChange.sequence)) {
        rolledBack = latestChange.change.apply(rolledBack);
      }
    }
    this.cleanup(token.bookmarkId);
    return rolledBack;
  }

  private cleanup(bookmarkId: string) {
    const pending = this.pending.get(bookmarkId);
    if (pending && pending.size > 0) return;
    this.pending.delete(bookmarkId);
    this.latest.delete(bookmarkId);
  }
}
