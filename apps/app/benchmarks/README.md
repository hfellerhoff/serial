# Serial `apps/app` performance benchmark contract — 2026-07-31

The Bookmark performance gate is intentionally strict: on the same fixture,
scope, visibility, page size, cache profile, warmup, and repetition schedule, a
new Bookmark operation passes only when both its median and p95 full-operation
latency are at most `1.5 ×` the matching production operation. A bounded page
must also stay bounded by driver-observed materialized rows. Timing noise is a
reason to improve the experiment, never to raise the ceiling.

The harness keeps the comparison and structural gates executable without
requiring generated reports in source control. Result files are local-only.

## Run from a clean checkout

From `apps/app`, with the repository's pinned Node and pnpm versions installed:

```sh
pnpm install --frozen-lockfile
pnpm benchmark:inventory:check
pnpm benchmark:app:smoke
```

The smoke command creates a temporary local libSQL database, applies checked-in
migrations, seeds the small fixture, runs interleaved warm-cache pairs, writes
`benchmarks/results/local-small.json`, removes the benchmark user, and deletes
the temporary database.

Run the full local measurement without turning a known failure into a command
failure:

```sh
pnpm benchmark:app --profile representative --cache all \
  --output benchmarks/results/local-representative.json
```

Run the enforceable gate after remediation:

```sh
pnpm benchmark:app:gate
```

`benchmark:app:gate` exits nonzero for any latency or structural failure. The
same calculation is used for local, scheduled, and production-like artifacts.

## Fixtures and paired method

The generator is deterministic apart from its isolated user ID. Every profile
contains Feeds, Feed items, Bookmarks, Page captures, direct View assignments,
Tags, ordered sections, Uncategorized items, and canonical collisions. Feed
items and Bookmarks use fixed 20% Saved, 40% Unread, and 40% Archived/Read
distributions.

| Profile        | Feed items | Bookmarks | Views | Default warmups | Default repetitions |
| -------------- | ---------: | --------: | ----: | --------------: | ------------------: |
| small          |      1,000 |       100 |     3 |               2 |                   7 |
| representative |     10,000 |     1,000 |    10 |               3 |                  15 |
| stress         |     50,000 |     5,000 |    25 |               3 |                  40 |

For each cache profile and visibility, the runner alternates which operation
goes first, discards all warmups, and records every later sample. `warm` reuses
one client connection. `cold` creates a fresh client for each operation while
keeping the seeded database unchanged. This is a cold driver/connection start,
not a claim that the operating system page cache has been flushed.

The runner exposes and invokes V8 garbage collection between samples, outside
the timed operation. This prevents an unrelated full-fixture collection pause
from becoming one operation's tail measurement. Stress uses 40 repetitions so
nearest-rank p95 is not the single slowest sample.

The initial executable pair uses the unassigned all-content View:

- `feed-view-page`: the existing production View prerequisite loads, bounded
  Feed-item SQL query, row materialization, and application projection.
- `mixed-view-page`: `queryMixedContentPage`, including all SQL, row
  materialization, canonical suppression, membership and visibility filtering,
  sorting, cursoring, and projection.

The page size is 30. Operations return equivalent visible scopes; a Bookmark
may suppress a colliding Feed item under the approved mixed-content semantics.

## Measurements and exact pass/fail rule

Each sample records:

- full-operation wall time;
- cumulative driver time and driver wall span;
- SQL statement count and per-statement returned rows;
- total returned/materialized rows;
- serialized result bytes and logical result rows; and
- process heap and resident-set deltas.

The runner uses nearest-rank percentiles. For every workload, cache profile, and
visibility:

```text
median ratio = candidate median full-operation ms / baseline median ms
p95 ratio    = candidate p95 full-operation ms / baseline p95 ms

latency pass = median ratio <= 1.5 AND p95 ratio <= 1.5
```

Ratios are calculated from unrounded values. Display rounding never influences
the result.

The deterministic page guard is:

```text
candidate maximum materialized rows
  <= baseline maximum materialized rows + page limit + one hasMore sentinel
```

The baseline already loads the user-level View, Feed, Tag, assignment, and
section metadata required by the current production operation. The allowance
therefore permits one additional bounded Bookmark page, not the user's entire
Bookmark or Feed-item collection.

The structural regression suite separately locks first and cursor View pages,
Tag pages, point publication lookups, maximum 500-Bookmark bulk updates, and
the selected Bookmark ordering index. Capture, ownership, organization,
deletion, and canonical consolidation retain direct persistence coverage; they
use absolute statement/row bounds where no semantically valid production ratio
exists.

## Which evidence runs where

| Environment or tool                          | Role                                                                                          | Gate status                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| local file libSQL/SQLite                     | Fast iteration, fixture validation, deterministic statement/row guards, query-plan inspection | Structural guards are hard CI candidates; latency is diagnostic                               |
| `turso dev`                                  | Exercises the libSQL network protocol and driver transfer on a developer machine              | Required before performance-ticket closure; output stays local or is attached to the ticket   |
| Dedicated networked Turso benchmark database | Production-like latency, transfer, and tail evidence                                          | Median and p95 1.5× gate; manual or scheduled because shared-network noise must be controlled |
| `EXPLAIN QUERY PLAN`                         | Index use, full scans, temp sorting, correlated-subquery evidence                             | Review evidence; plan changes are interpreted, not reduced to a brittle text snapshot         |
| Driver instrumentation                       | SQL count, DB duration, and materialized rows                                                 | Statement/row limits are deterministic structural gates                                       |
| Browser profiler                             | Hydration, synchronization, cache mutation, rendering, long tasks, and heap growth            | Production Chromium budgets are hard gates; development measurements remain diagnostic        |
| CI                                           | Fixture/model tests, current-source inventory checks, then bounded statement/row guards       | Hard and deterministic; hosted timing does not replace scheduled Turso evidence               |

For `turso dev` or a remote target, provision and migrate a dedicated benchmark
database first. The runner refuses external seeding without the explicit safety
flag and deletes only its isolated benchmark user afterward:

```sh
pnpm benchmark:app --profile representative --cache all \
  --database-url http://127.0.0.1:8080 \
  --allow-external-seed \
  --output benchmarks/results/turso-dev-representative.json
```

For a hosted database, add `--auth-token <token>` and keep credentials outside
artifacts and version control.

## Production baseline and local outputs

The pre-Bookmark production reference is `090d075f`. The executable baseline is
the preserved Feed View-page behavior that Bookmark mixed pages extend. Before
accepting a new baseline, compare the relevant Feed query and filter code with
that reference and explain any intentional production change in the artifact's
review note. Never compare the candidate with an older or smaller fixture.

Write local JSON artifacts using this pattern:

```text
benchmarks/results/<environment>-<profile>-<git-sha>.json
```

An artifact contains its git commit, branch, reference baseline, fixture counts,
method, raw samples and statement observations, distribution summaries,
structural counts, ratios, and gate result. The result directory and generated
ledgers are ignored by Git. Attach production-like evidence to the relevant
performance ticket or pull request when it must be retained. Do not commit
artifacts, credentials, database URLs, or raw user data to product source.

## Database-facing inventory and comparison operations

`pnpm benchmark:inventory` generates the ignored local
`benchmarks/app-query-inventory.json` from all TypeScript and TSX under `src`,
`server`, `tests`, and `scripts` (excluding migrations). It records database
client creation and every direct select, insert, update, delete, transaction,
batch, execute, and relational find call, grouped across request procedures,
synchronization/projection, background and maintenance tasks, Bookmark capture,
authentication, administration, database infrastructure, and test-only
infrastructure. `pnpm benchmark:inventory:check` scans current source directly
and does not require the generated ledger.

The following production comparisons define the audit queue. The page pair is
implemented by this checkpoint; subsequent audit tickets add or reuse registered
pairs without changing the calculation.

| New Bookmark query path                                    | Matching production operation                           | Required evidence                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| mixed `requestPage` / `queryMixedContentPage` for a View   | `requestItemsByVisibility` View page                    | All three visibilities, flat and sectioned Views, first and cursor pages |
| mixed tag page                                             | `requestItemsByCategoryId` category page                | All visibilities and cursor pages                                        |
| mixed `synchronize` page fan-out                           | `requestInitialData` and View revalidation fan-out      | 3, 10, and 25 Views; statement/row totals and wall span                  |
| `buildBookmarkDiff` / `loadApplicationBookmarks`           | Feed-item initial manifest and diff load                | Empty, unchanged, partial-change, and deletion manifests                 |
| `loadApplicationBookmark` used by upsert publishing        | Point Feed-item lookup used by state updates            | First, middle, last, missing, and wrong-owner IDs                        |
| `getBookmarkCapture`                                       | `requestFullTextForItems` for one Feed item             | Hit, content-hash unchanged, missing, and wrong-owner cases              |
| Bookmark ownership checks and state/View/Tag/delete writes | Equivalent Feed-item, View, and Tag mutation procedures | Query count, returned rows, transaction duration, and ownership failure  |
| app and extension save/consolidation reads                 | Feed add/deduplication and ownership reads              | New URL, canonical collision, refresh, and wrong-owner cases             |

Capture fetching, RSS parsing, Redis/KV access, browser rendering, and publisher
delivery remain in the repository-wide inventory even when they are not SQL page
pairs. Their audit evidence uses the environment/tool division above.

## Client coverage

`pnpm benchmark:client:coverage` writes an ignored local coverage ledger.
`pnpm benchmark:client:coverage:check` scans current client source and validates
that every configured finding path still belongs to the applicable coverage
set; it does not require a committed report.

The client audit profiles also measure local mixed-content View projection over
their complete Bookmark fixtures. This protects fetch-free View navigation and
View-chip status computation with the same 50 ms operation budget as other
client state transitions.
