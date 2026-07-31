# Serial `apps/app` client and synchronization audit — 2026-07-31

## Result

The pre-UI Bookmark foundation is not safe to extend yet. The audit originally
found five release-blocking client/synchronization problems. CL-02 is now
resolved: Bookmark synchronization uses a constant-size bucket manifest,
unchanged reconnects refill no mixed scopes, incoming pages commit as one frame
batch, and large persisted collections use normalized or chunked IndexedDB
records. The remaining findings continue to block the UI checkpoint.

The checked [coverage ledger](client-audit-coverage.json) records a finding or an
explicit clean result for every applicable route, component, hook, state,
subscription, persistence, rendering, style, and client/shared module. Server-
only code remains owned by the parallel server/database audit; client-triggered
server operations are included here where they affect requests, bytes, or fan-
out.

## Method and retained evidence

`benchmark:client` runs deterministic store/subscription scenarios at the same
small, representative, and stress fixture sizes as the database benchmark. It
measures synchronous JavaScript duration, store notifications, heap deltas,
persisted structured-clone payload size, and authoritative refill count.

The opt-in Playwright profile runs Chromium against the representative
self-hosted fixture. `?client-performance-audit=1` enables React commit
measurement without affecting ordinary sessions. The profile records long
tasks, React commit duration, IndexedDB reads/writes, total and RPC request bytes,
heap, time to usable content, reconnect, pagination, and native reader entry.

```sh
pnpm benchmark:client:coverage:check
pnpm benchmark:client:smoke
pnpm benchmark:client --profile representative \
  --output benchmarks/results/client-representative.json
pnpm benchmark:client --profile stress \
  --output benchmarks/results/client-stress.json

SERIAL_RUN_CLIENT_PERFORMANCE=1 pnpm test:e2e:self-hosted \
  tests/e2e/self-hosted/client-performance-audit.spec.ts --reporter=line
```

Retained evidence:

- [small deterministic profile](results/client-small.json)
- [representative deterministic profile](results/client-representative.json)
- [stress deterministic profile](results/client-stress.json)
- [representative Chromium profile](results/browser-client-representative.json)

## Fixture results

| Measurement                          |                   Small |          Representative |                   Stress |
| ------------------------------------ | ----------------------: | ----------------------: | -----------------------: |
| Feed items / Bookmarks / Views       |         1,000 / 100 / 3 |     10,000 / 1,000 / 10 |      50,000 / 5,000 / 25 |
| Loaded mixed scopes                  |                      12 |                      33 |                       78 |
| Persisted client payload             |                 0.58 MB |                 5.60 MB |                 28.31 MB |
| One Bookmark progress event          |    0.59 ms / 12 refills |    1.06 ms / 33 refills |     3.83 ms / 78 refills |
| 100 Bookmark events, one frame       |    41.7 ms / 12 refills |    99.8 ms / 33 refills |    312.1 ms / 78 refills |
| 100 Bookmark events, separate frames | 33.8 ms / 1,200 refills | 86.8 ms / 3,300 refills | 302.5 ms / 7,800 refills |
| Cold synchronization JS              |                 3.18 ms |                 45.2 ms |                 439.2 ms |
| Whole-cache structured clone         |                 5.18 ms |                 28.9 ms |                 149.4 ms |

CL-02's retained post-remediation profiles replace the final two rows with the
following bounded measurements:

| Measurement                                  |       Small | Representative |       Stress |
| -------------------------------------------- | ----------: | -------------: | -----------: |
| Bookmark sync request / 16 KiB budget        |    2.68 KiB |       2.68 KiB |     2.68 KiB |
| Largest response page / 256 KiB budget       |    2.20 KiB |      13.34 KiB |    35.20 KiB |
| Cold Bookmark commit / notifications         | 0.09 ms / 1 |    0.34 ms / 1 |  1.07 ms / 1 |
| Unchanged warm sync / mixed refills          | 1.35 ms / 0 |    3.59 ms / 0 | 18.81 ms / 0 |
| Normalized mutation / 512 KiB storage budget |    8.92 KiB |       8.92 KiB |     8.92 KiB |

Heap deltas are diagnostic only because garbage collection may occur inside a
sample; payload size, notification count, refill count, and synchronous duration
are the deterministic evidence.

The representative Chromium run recorded:

| Scenario             | Usable / observed time |  Long task |            React work |               IndexedDB | RPC requests / bytes |
| -------------------- | ---------------------: | ---------: | --------------------: | ----------------------: | -------------------: |
| Cold client          |          577 ms usable |  69 ms max | 26 commits, 35 ms max | 11 reads, 1,348 records |          7 / 1.49 MB |
| Warm hydration       |          605 ms usable | 212 ms max | 20 commits, 94 ms max | 1,350 reads, 345 writes |           6 / 329 KB |
| Visibility reconnect |      3.0 s observation |  85 ms max | 17 commits, 73 ms max |     0 reads, 345 writes |           6 / 329 KB |
| Pagination           |      2.0 s observation | 118 ms max | 11 commits, 62 ms max |                    none |            1 / 22 KB |
| Native reader entry  |                 220 ms | 191 ms max |  8 commits, 90 ms max |               32 writes |         2 / streamed |

Normalized IndexedDB counts are per-record operations rather than whole-store
transactions. Cold load writes the authoritative retained records once; warm
hydration reads them in batches, and reconnect changes only the bounded records
returned by existing Feed synchronization. No scenario writes one library-sized
structured-clone value.

The original representative run failed with `RESPONSE_TOO_LARGE` while automatic
mixed synchronization materialized all 10,000 Feed items for every scope. The
post-remediation run passes because reconnect synchronizes Bookmark buckets only;
mixed pages are requested on demand through their bounded page contract instead
of being preloaded for every View and visibility. Capture rendering is not
reachable in the app before the Serial-app Bookmark UI checkpoint, so the audit
covers its current cache/SSE representation and records native Page-capture
rendering as part of that later checkpoint's acceptance.

## Prioritized findings

### CL-01 — Critical: list-neutral Bookmark events reproject and refill every scope

`processPublishedChunks` sends every Bookmark upsert—including progress-only and
capture-only changes—through `reprojectUpsert`. That routine scans, filters, and
sorts every loaded scope, and `useDataSubscription` then requests an authoritative
first page for every affected scope. One stress event creates 78 server refills;
100 events delivered across animation frames create 7,800. Even a same-frame
burst still performs 100 complete local reprojections and produced a 311 ms main-
thread stall.

Remediation direction: classify Bookmark changes by projection-relevant fields;
patch entity-only state without reprojection; index canonical membership and
scope membership; return only genuinely changed scopes; coalesce and deduplicate
authoritative validation with bounded concurrency; make list-neutral-event zero
refill behavior a hard regression test.

### CL-02 — Resolved: synchronization and persistence are incremental and bounded

Bookmark synchronization now partitions the authoritative collection into 64
stable buckets. The client uploads one 2.68 KiB bucket-version manifest at every
fixture size; the server publishes only changed buckets in pages capped at 50
Bookmarks and 256 KiB. The measured stress maximum is 35.20 KiB. An unchanged
warm reconnect publishes no Bookmark pages and performs zero mixed-scope refills,
so View count no longer drives reconnect fan-out or `RESPONSE_TOO_LARGE`.

The subscription coordinator applies all Bookmark sync pages received in one
animation-frame flush through one store commit and applies mixed-page Bookmark
and Feed-item entities through one batch commit per store. Stress cold Bookmark
processing fell from roughly 439 ms with 2,340 Feed-item and 78 mixed-store
notifications to 1.07 ms with one Bookmark notification and no Feed-item or mixed
notifications.

The application, Bookmark, and mixed-content stores now migrate their large
dictionaries to normalized IndexedDB records; the Feed-item order is split into
250-ID chunks. The cache can still retain 28.31 MB until CL-04 adds page retention,
but one entity mutation writes only the changed record and an order-preserving
mutation writes no order chunks. The retained stress mutation fixture clones
8.92 KiB in 9.54 ms against a 512 KiB per-mutation budget instead of cloning the
whole 28.31 MB cache.

### CL-03 — High: list-neutral Feed-item updates still scan scope and list metadata

`setFeedItem` always reconciles the item against every loaded Feed scope.
`doesFeedItemPassFilters` repeatedly rebuilds category/View sets and scans View
metadata inside those loops. List and sidebar selectors subscribe to whole
dictionaries, so progress and full-text patches can re-filter/re-sort active
lists and recompute presence for every View, Feed, and Tag even when ordering and
membership cannot change. A single stress progress update takes 13.7 ms before
React rendering or persistence.

Remediation direction: split entity fields from projection fields, use per-item
selectors for progress/content, pre-index Feed/Tag/View membership, and only
reconcile or sort when visibility, placement, normalized ordering time, or scope
membership changes.

### CL-04 — High: windowed DOM does not bound memory or persistence growth

`useItemWindow` correctly caps mounted list items, and the audit found no DOM
growth proportional to the full library. However pagination permanently appends
entities to `feedItemsDict`, `feedItemsOrder`, scope arrays, mixed scopes, and
IndexedDB. There is no page/entity eviction or byte budget, so a long-lived client
can eventually retain and rewrite the whole library. The stress snapshot is
already 28.31 MB with minimal fixture content.

Remediation direction: keep cursor-addressable bounded pages, retain a small
navigation window and explicitly pinned reader entities, evict distant pages,
and impose measured memory/IndexedDB byte budgets.

### CL-05 — High: current hydration, pagination, and reader paths contain long tasks

Warm hydration produced a 234 ms long task and a 107 ms React commit; pagination
produced a 119 ms long task; native reader entry produced a 182 ms long task and
an 83 ms React commit. Rendering is windowed and Page-capture HTML is sanitized,
but broad store subscriptions, repeated full-list section derivation, and the
large `ArticleSidebars` layout/effect surface remain visible main-thread costs.

Remediation direction: profile production builds after CL-01 through CL-04,
stabilize selector inputs, derive full section layouts once per projection,
defer non-visible sidebar/footnote work, and set hard long-task/commit budgets for
cold load, warm hydration, pagination, reader, and future Page-capture rendering.

## Explicit clean results

- SSE chunks are animation-frame buffered, initial Feed chunks have batching,
  and full-text IDs are deduplicated and fetched in bounded batches.
- IndexedDB writes remain throttled and flush on visibility/pagehide; large
  dictionaries are normalized per entity and ordered IDs use fixed-size chunks.
- `useItemWindow` bounds mounted list items and pagination uses cursors. No list
  DOM proportional to 50,000 Feed items was found.
- Subscription lifecycle listeners and abort-signal cleanup are bounded per app
  mount; no reconnect listener leak was found.
- Page capture HTML enters the client already sanitized and reader parsing has no
  additional network fan-out. The current app has no Bookmark capture-rendering
  route to profile before the UI checkpoint.
- All other applicable files have the explicit clean result recorded in the
  coverage ledger; UI primitives, settings/admin screens, auth routes, static
  helpers, and styling do not independently amplify library-sized work.
