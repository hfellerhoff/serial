# `apps/app` server and database performance audit — 2026-07-31

This audit reviews the server, database, capture, authentication,
administration, background-task, benchmark, and server-facing route surface at
`44b2c4e2` (the Bookmark benchmark merge on `beta`). It is an audit, not a
remediation change. Critical and high findings remain release blockers.

## Method and evidence

- The generated inventory covers TypeScript and TSX in `src`, `server`,
  `tests`, and `scripts`, excluding generated migrations. It contains 410
  direct database accesses after this audit added the previously omitted
  `server/tasks` scope.
- Every inventory entry was reviewed in its owning call path. Server entry
  points and network/capture helpers without a direct database call were added
  to the coverage ledger below.
- The checked-in small baseline and fresh representative and stress runs use
  deterministic fixtures and the benchmark contract in this directory. The
  representative run covers warm and cold clients; stress covers warm cache.
- Static scaling analysis counts call-site fan-out in addition to driver rows.
  This matters where one request repeats the measured operation many times.
- SQL structure and schema indexes were reviewed for every new Bookmark path.
  Stable plan assertions are deferred to remediation because the current mixed
  projection has no bounded SQL page query to explain: it deliberately selects
  whole user collections, then filters and sorts in application code.

Reproduction:

```sh
pnpm benchmark:inventory:check
node --import=tsx scripts/performance/run-app-benchmark.ts \
  --profile representative --cache all \
  --output benchmarks/results/audit-local-representative-44b2c4e2.json
node --import=tsx scripts/performance/run-app-benchmark.ts \
  --profile stress --cache warm \
  --output benchmarks/results/audit-local-stress-44b2c4e2.json
```

## Measured Bookmark page failure

Every measured cell fails both the exact `1.5×` latency ceiling and the
bounded-row invariant.

| Profile/cache       | Visibility | Baseline median / p95 |     Mixed median / p95 | Median / p95 ratio | Rows / budget |
| ------------------- | ---------- | --------------------: | ---------------------: | -----------------: | ------------: |
| representative/warm | unread     |        3.52 / 3.92 ms |     232.51 / 247.58 ms |    65.99× / 63.20× |  11,680 / 198 |
| representative/warm | read       |        3.54 / 4.57 ms |     232.27 / 245.72 ms |    65.65× / 53.75× |  11,680 / 198 |
| representative/warm | later      |        3.03 / 3.43 ms |     230.31 / 246.26 ms |    75.98× / 71.74× |  11,680 / 198 |
| representative/cold | unread     |        3.69 / 4.11 ms |     231.61 / 244.99 ms |    62.74× / 59.59× |  11,680 / 198 |
| representative/cold | read       |        3.85 / 5.10 ms |     232.36 / 245.03 ms |    60.42× / 48.03× |  11,680 / 198 |
| representative/cold | later      |        3.47 / 3.65 ms |     231.03 / 246.02 ms |    66.54× / 67.33× |  11,680 / 198 |
| stress/warm         | unread     |      19.19 / 20.40 ms | 1,338.18 / 1,364.76 ms |    69.72× / 66.88× |  58,163 / 408 |
| stress/warm         | read       |      19.39 / 20.78 ms | 1,339.30 / 1,369.58 ms |    69.07× / 65.90× |  58,163 / 408 |
| stress/warm         | later      |      12.17 / 13.52 ms | 1,338.75 / 1,370.88 ms |  110.01× / 101.40× |  58,163 / 408 |

The stress candidate also has a roughly 205–216 MiB median heap delta and up
to 226 MiB RSS growth per measured page. Result payloads remain bounded; the
cost is hidden in server-side reads, materialization, transformation, and sort.

## Prioritized findings

### SDB-01 — Critical — mixed pages materialize and transform the whole library

`queryMixedContentPage` loads every Feed item, Feed, Bookmark, capture,
Bookmark assignment, View, Tag, Feed assignment, and section for the user. It
then canonicalizes URLs, computes membership and visibility, sorts all
candidates, applies the cursor, and slices 30 results in memory. Later pages do
the same full work. This is the direct cause of the measured failures and is a
release blocker independently of local timing.

The application work also contains avoidable quadratic passes:

- `loadApplicationBookmarks` filters all View and Tag assignment rows once per
  Bookmark. The stress fixture performs about 14.6 million assignment-row
  comparisons before mixed projection begins.
- mixed Feed projection filters all Feed/Tag rows once per Feed item and
  reparses each candidate URL for canonical comparison.
- View construction repeatedly filters every View association array.

Remediation direction: implement indexed, scope-aware candidate queries that
apply ownership, membership, visibility, ordering, cursor, and `limit + 1` in
SQL; fetch captures and assignments only for the bounded Bookmark page; and
make canonical suppression queryable without parsing the full Feed-item set.
This belongs to **Bring Bookmark data paths within the performance budget**.

### SDB-02 — Critical — synchronize multiplies the full scan by View count

`mixedContent.synchronize` publishes three visibilities for Uncategorized plus
every custom View using one unbounded `Promise.all`. At the stress fixture this
is 78 simultaneous full-library mixed projections. Based on the measured
58,163 rows per page, one reconnect can materialize at least 4,536,714 rows for
page projection alone, before the Bookmark diff and View query. It issues about
784 SQL statements and repeats URL normalization, membership work, sorting,
and large temporary allocations 78 times.

Remediation direction: share bounded prerequisite work, synchronize only
active/needed scopes, cap concurrency, and represent unchanged scope state
without refilling every View/visibility. This belongs to **Bring Bookmark data
paths within the performance budget**; client request policy is covered by the
parallel client/synchronization audit.

### SDB-03 — Critical — point publication loads every Bookmark; bulk read amplifies it 500×

`loadApplicationBookmark` calls `loadApplicationBookmarks` and uses `find` for
a point ID. Every save, state change, View change, and Tag change therefore
reloads every Bookmark, capture, and assignment before publishing one entity.

`bookmark.setBulkReadValue` accepts 500 IDs, launches 500 updates concurrently,
then launches 500 point publications concurrently. At the stress fixture each
point publication materializes about 7,917 Bookmark/capture/assignment rows, so
the maximum request shape approaches 2,000 statements and 3,959,000
materialized rows, with 500-way application and database concurrency.

Remediation direction: add a true user-owned point query, batch state writes
and post-write loads, publish one bounded bulk event, and cap input/concurrency.
This belongs to **Bring Bookmark data paths within the performance budget**.

### SDB-04 — High — Bookmark indexes do not support required page orderings

The Bookmark table has only `(user_id)` and unique
`(user_id, canonical_url)` indexes. Required visibility/order combinations
need indexed access by user plus Saved/read state and their normalized ordering
timestamps. Current code hides this because it does no SQL pagination at all.
Canonical suppression also cannot be expressed efficiently against Feed items:
Feed-item URLs are normalized in JavaScript and have no stored normalized key.

Remediation direction: select concrete query shapes first, then add the minimum
composite indexes and a migration/backfill for any queryable canonical key.
Verify all flat, sectioned, Tag, Uncategorized, collision, first-page, and
cursor-page plans. This belongs to **Bring Bookmark data paths within the
performance budget**.

### SDB-05 — High — exposed legacy Feed procedures still perform unbounded item reads

`feedItem.getAll` loads every Feed item for the user before chunking, and
`feedItem.getByFeedId` loads every item in a Feed before yielding chunks. The
oRPC router still exposes both; `getByFeedId` remains called by the current
client store. Chunking the response does not bound database transfer or server
memory. `initial.getAllByView` is also exposed as a legacy path and fans queries
across every View.

Remediation direction: retire unused legacy procedures and move remaining
callers to the cursor-based request procedures. Until removal, make every item
read cursor-bounded. This is tracked by **Bound legacy and organization server
workloads**.

### SDB-06 — High — background refresh loads global work and creates unbounded fan-out

The scheduled refresh task loads all eligible users, resolves every plan with
an unbounded `Promise.all` (potentially one KV/Polar operation per user), then
loads all due Feeds into memory. Within a user, `fetchAndInsertFeedData` creates
one live promise per Feed. Hosted Turso sets the database semaphore to
`Infinity`, so remote fetches and database work can burst with library size.
The task processes users sequentially, but that does not bound per-user work or
the initial global reads.

Remediation direction: claim due work in bounded pages, batch plan resolution,
use a fixed worker pool for network and database work in every environment, and
record queue/backpressure metrics. This is tracked by **Bound Feed refresh and
ingestion resource use**.

### SDB-07 — High — RSS ingestion has unbounded response bodies and secondary fetches

Feed discovery and every RSS parser use `fetch(...).text()` or parser URL
helpers without a shared response-size or total-time limit. Website feeds also
launch one `og:image` page fetch for every item lacking a thumbnail via
`Promise.all`. Combined with unbounded Feed promise creation, a slow or large
remote feed can hold memory and sockets well beyond its useful work.

Remediation direction: centralize bounded Feed HTTP reads with redirect,
header, body, and total deadlines; cap parsed items/content; and limit or defer
secondary metadata fetches. This is tracked by **Bound Feed refresh and
ingestion resource use**.

### SDB-08 — Medium — bounded Feed pages repeatedly reload all prerequisite metadata

The current Feed comparator correctly bounds Feed-item rows, but every page
reloads all user Feeds, Views, Tags, assignments, and sections in seven
prerequisite statements. `requestInitialData`, revalidation, and pagination
rebuild View objects using repeated array filters. Cost grows with the whole
organization graph even when requesting one later page.

Remediation direction: load only the target scope for page requests, index
association maps once when full metadata is genuinely needed, and reuse an
explicit user organization snapshot where safe. This is tracked by **Bound
legacy and organization server workloads** and must not be hidden by the
Bookmark comparison.

### SDB-09 — Medium — bulk organization inputs and statement counts are not bounded

Feed, Tag, and View bulk procedures accept arrays without maximum sizes.
Several perform one statement per item through `Promise.all` inside a
transaction (`feedCategories`, content-category synchronization, and View
placement). Large inputs can exceed SQL variable limits or create bursty
statement fan-out.

Remediation direction: impose contract limits, deduplicate IDs, use set-based
inserts/updates/deletes in bounded chunks, and test maximum statement counts.
This is tracked by **Bound legacy and organization server workloads**.

### SDB-10 — Medium — benchmark coverage is complete for mixed View pages, not all Bookmark operations

The retained benchmark provides a credible paired gate only for the mixed View
page. The required Tag page, synchronize, diff, point publication, capture,
ownership/write, bulk, and save/consolidation scenarios are inventoried but do
not yet have executable paired cells. Several lack a semantically valid
production comparator; that absence must be explicit rather than represented
by an arbitrary ratio.

Remediation direction: extend the harness during **Bring Bookmark data paths
within the performance budget** with the full operation/scenario matrix. Use
absolute structural budgets where no comparator exists, and retain
production-like Turso timing for every valid pair before the final gate.

## Paths reviewed without a release-blocking finding

- Bookmark capture request bodies, fetched HTML, stored HTML, DOM size,
  redirects, response headers, total attempt duration, and per-user/server
  capture concurrency are explicitly bounded. Capture remains synchronous by
  product decision; failure preserves the Bookmark.
- Bookmark save/consolidation queries are point- or two-entity-bounded and use
  the unique user/canonical index. Their post-save publication is covered by
  SDB-03.
- Bookmark ownership, capture lookup, state update, View/Tag assignment, and
  delete statements are owner-scoped and bounded individually. Bulk composition
  is covered by SDB-03 and SDB-09.
- Authentication and extension-session lookup use primary or unique indexed
  keys with bounded request bodies. Better Auth internal operations are outside
  the direct-call inventory but were reviewed at their app entry points.
- Admin user listing is paginated; statistics aggregate in SQL. Invitation,
  configuration, and per-user administration queries are bounded or operate on
  intentionally small administrative tables. Retention statistics materialize
  recent signup-month rows but are low-frequency admin work, not a release
  blocker at current scale.
- Page capture, extension authentication, and SSE payloads have bounded input
  contracts. Publisher retention can magnify the already-identified mixed and
  bulk payload fan-out but introduces no independent unbounded query.
- Schema migration execution is sequential and transactional by design.
  Benchmark fixture writes are intentionally chunked and test-only.

## Coverage ledger

`direct` means the file owns one or more generated inventory entries. `related`
means it participates in an inventoried server path without issuing a direct
database call. `excluded` means it is a client-rendering route with no server or
database responsibility; it is named here to make the audit boundary explicit.

### Benchmark and task entry points

| File                                           | Coverage result                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `scripts/performance/database.ts`              | direct — instrumentation and migration helpers clean; row instrumentation retained        |
| `scripts/performance/fixtures.ts`              | direct — deterministic/chunked test-only writes clean                                     |
| `scripts/performance/inventory-app-queries.ts` | related — fixed missing `server/tasks` scope (SDB-10)                                     |
| `scripts/performance/model.ts`                 | related — exact percentile and 1.5× rules clean                                           |
| `scripts/performance/operations.ts`            | direct — mixed View pair reviewed; incomplete operation matrix (SDB-10)                   |
| `scripts/performance/run-app-benchmark.ts`     | related — paired runner clean for registered pair                                         |
| `server/tasks/demo/midnight-wipe.ts`           | direct — intentionally global demo-only maintenance operation, guarded by instance checks |
| `server/tasks/feeds/background-refresh.ts`     | direct — SDB-06                                                                           |

### Server-facing app routes

| File                                 | Coverage result                                             |
| ------------------------------------ | ----------------------------------------------------------- |
| `src/app/api.demo.provision.ts`      | related — demo provisioning delegates to bounded auth setup |
| `src/app/api.extension.bookmarks.ts` | direct — request bounded; post-save SDB-03                  |
| `src/app/api/auth.$.ts`              | related — Better Auth adapter entry point reviewed          |
| `src/app/api/extension-auth.$.ts`    | direct — indexed point lookups and 2 KiB body limit clean   |
| `src/app/api/health.ts`              | related — no database work                                  |
| `src/app/api/rpc.$.ts`               | related — oRPC adapter only                                 |
| `src/app/auth.connect-extension.tsx` | related — server session/grant orchestration clean          |
| `src/app/sitemap.ts`                 | related — no database work                                  |

### API, synchronization, and request procedures

| File                                                | Coverage result                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/server/api/channels.ts`                        | related — channel naming only                                                                  |
| `src/server/api/constants.ts`                       | related — page constants bounded                                                               |
| `src/server/api/publisher.ts`                       | related — bounded retention; amplification inherited from SDB-02/SDB-03                        |
| `src/server/api/routers/admin/base.ts`              | related — authorization wrapper only                                                           |
| `src/server/api/routers/admin/config.ts`            | direct — small config/admin sets; clean                                                        |
| `src/server/api/routers/admin/index.ts`             | related — router composition only                                                              |
| `src/server/api/routers/admin/invitations.ts`       | direct — administrative list/point operations; clean at current scale                          |
| `src/server/api/routers/admin/queries.ts`           | direct — bounded user/account/session lookup                                                   |
| `src/server/api/routers/admin/stats.ts`             | direct — SQL aggregation clean; recent cohort materialization accepted as medium/low-frequency |
| `src/server/api/routers/admin/users.ts`             | related — paginated Better Auth calls clean                                                    |
| `src/server/api/routers/bookmarkRouter.ts`          | related — SDB-03 and SDB-10                                                                    |
| `src/server/api/routers/contentCategoriesRouter.ts` | direct — SDB-09                                                                                |
| `src/server/api/routers/feed-router/index.ts`       | direct — bounded import batching partly present; SDB-07/SDB-09                                 |
| `src/server/api/routers/feed-router/utils.ts`       | direct — indexed/set-based ownership checks clean for bounded inputs                           |
| `src/server/api/routers/feedCategoriesRouter.ts`    | direct — SDB-09                                                                                |
| `src/server/api/routers/feedItemRouter.ts`          | direct — SDB-05; point mutations otherwise bounded                                             |
| `src/server/api/routers/hsl.ts`                     | related — validation only                                                                      |
| `src/server/api/routers/initialRouter.ts`           | direct — bounded item query shape; SDB-05/SDB-08 and View fan-out comparator                   |
| `src/server/api/routers/instapaperRouter.ts`        | direct — bounded point operations; remote I/O low-volume                                       |
| `src/server/api/routers/mixedContentRouter.ts`      | direct — SDB-02                                                                                |
| `src/server/api/routers/subscriptionRouter.ts`      | direct — point user/subscription work; remote operations bounded per request                   |
| `src/server/api/routers/userConfigRouter.ts`        | direct — unique per-user point operations clean                                                |
| `src/server/api/routers/userRouter.ts`              | direct — point update/delete clean                                                             |
| `src/server/api/routers/viewFeedsRouter.ts`         | direct — SDB-09                                                                                |
| `src/server/api/routers/viewRouter.ts`              | direct — SDB-08/SDB-09                                                                         |
| `src/server/api/schemas.ts`                         | related — schemas only                                                                         |
| `src/server/api/server.ts`                          | related — request context only                                                                 |
| `src/server/api/utils/buildUncategorizedView.ts`    | related — bounded by supplied organization metadata; repeated use covered by SDB-08            |

### Authentication, Bookmark, database, and shared server modules

| File                                     | Coverage result                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `src/server/auth/constants.ts`           | related — configuration validation only                                   |
| `src/server/auth/endpoints.ts`           | direct — bounded invitation/auth callbacks                                |
| `src/server/auth/extension.ts`           | direct — unique/primary-key grant and session operations clean            |
| `src/server/auth/index.tsx`              | direct — Better Auth hooks reviewed; point/config operations clean        |
| `src/server/bookmarks/contracts.ts`      | related — explicit size/time contracts clean                              |
| `src/server/bookmarks/extract.ts`        | related — DOM and stored-output bounds clean                              |
| `src/server/bookmarks/fetch.ts`          | related — SSRF-pinned, redirect/body/header/total-time bounded            |
| `src/server/bookmarks/limits.ts`         | related — per-user and server capture concurrency bounded                 |
| `src/server/bookmarks/sanitize.ts`       | related — bounded sanitizer input from contracts                          |
| `src/server/bookmarks/service.ts`        | direct — bounded writes; SDB-03/SDB-10 post-write paths                   |
| `src/server/bookmarks/ssrf.ts`           | related — address validation only                                         |
| `src/server/bookmarks/url.ts`            | related — normalization cost becomes unbounded only in SDB-01             |
| `src/server/checkFeedItemIsVertical.ts`  | related — constant-time URL classification                                |
| `src/server/db/constants.ts`             | related — constants only                                                  |
| `src/server/db/index.ts`                 | direct — single client construction; clean                                |
| `src/server/db/migrate.ts`               | direct — sequential transactional migration work clean                    |
| `src/server/db/schema.ts`                | related — all indexes reviewed; SDB-04                                    |
| `src/server/db/utils.ts`                 | related — conflict-update SQL builder only                                |
| `src/server/demo.ts`                     | related — environment helper only                                         |
| `src/server/email.ts`                    | related — one bounded provider call per invocation                        |
| `src/server/instapaper/client.ts`        | related — low-volume remote adapter; no library fan-out found             |
| `src/server/invitations.ts`              | direct — indexed token plus bounded redemption count clean                |
| `src/server/kv.ts`                       | related — singleton clients; in-memory TTL cleanup bounded by stored keys |
| `src/server/logger.ts`                   | related — logging only                                                    |
| `src/server/mixed-content/projection.ts` | direct — SDB-01/SDB-04                                                    |
| `src/server/mixed-content/sync.ts`       | related — SDB-03                                                          |
| `src/server/orpc/base.ts`                | related — auth/context wrapper only                                       |
| `src/server/orpc/router.ts`              | related — confirms legacy and Bookmark procedures remain exposed          |
| `src/server/otp.ts`                      | related — constant-time token generation                                  |
| `src/server/public-config.server.ts`     | related — config access only                                              |
| `src/server/public-config.ts`            | related — types only                                                      |
| `src/server/releases.ts`                 | related — cached, single small remote document; clean                     |

### RSS, maintenance, and subscriptions

| File                                        | Coverage result                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/server/rss/calculateNextFetch.ts`      | related — constant-time schedule calculation                                    |
| `src/server/rss/feedCache.ts`               | related — bounded per-feed cache records; lifecycle clean                       |
| `src/server/rss/fetchFeeds.ts`              | direct — SDB-06/SDB-07                                                          |
| `src/server/rss/hash.ts`                    | related — linear in already-unbounded item content; SDB-07 owns input bound     |
| `src/server/rss/parsers/nebula.ts`          | related — SDB-07                                                                |
| `src/server/rss/parsers/peertube.ts`        | related — SDB-07                                                                |
| `src/server/rss/parsers/unknown.ts`         | related — SDB-07                                                                |
| `src/server/rss/parsers/website.ts`         | related — SDB-07 secondary-fetch fan-out                                        |
| `src/server/rss/parsers/youtube.ts`         | related — SDB-07                                                                |
| `src/server/rss/refreshUserFeeds.ts`        | related — per-result publisher sequential; upstream fan-out SDB-06              |
| `src/server/rss/types.ts`                   | related — schemas/types only                                                    |
| `src/server/rss/validateFeedUrl.ts`         | related — validation only                                                       |
| `src/server/scripts/addIdsToFeedItems.ts`   | direct — manual maintenance script; intentionally full-table and chunked writes |
| `src/server/subscriptions/fetchProducts.ts` | related — cached product accessor only                                          |
| `src/server/subscriptions/helpers.ts`       | direct — point plan checks clean; full active-Feed load only in plan transition |
| `src/server/subscriptions/kv.ts`            | direct — point cache/database side effects; background N+1 covered by SDB-06    |
| `src/server/subscriptions/plans.ts`         | related — constants only                                                        |
| `src/server/subscriptions/polar.ts`         | related — singleton client/configuration only                                   |
| `src/server/subscriptions/products.ts`      | related — small fixed product set and cache                                     |

### Explicitly excluded client-rendering routes

These files contain no server/database path and belong to the parallel
client/rendering audit: `src/app/__root.tsx`, `src/app/_app.admin.index.tsx`,
`src/app/_app.admin.info.tsx`, `src/app/_app.admin.invites.tsx`,
`src/app/_app.admin.settings.tsx`, `src/app/_app.admin.stats.tsx`,
`src/app/_app.admin.user.$id.tsx`, `src/app/_app.admin.users.tsx`,
`src/app/_app.debug.tsx`, `src/app/_app.feeds.tsx`, `src/app/_app.import.tsx`,
`src/app/_app.index.tsx`, `src/app/_app.read.$id.tsx`,
`src/app/_app.tags.tsx`, `src/app/_app.tsx`, `src/app/_app.views.tsx`,
`src/app/_app.watch.$id.tsx`, `src/app/auth.reset.tsx`,
`src/app/auth.sign-in.tsx`, `src/app/auth.sign-up.tsx`, `src/app/auth.tsx`,
`src/app/auth.verify-email.tsx`, and `src/app/maintenance.tsx`.

## Release disposition

The server/database foundation is not safe for Bookmark UI work. SDB-01
through SDB-04 must be remediated by **Bring Bookmark data paths within the
performance budget**. SDB-05, SDB-08, and SDB-09 belong to **Bound legacy and
organization server workloads**; SDB-06 and SDB-07 belong to **Bound Feed
refresh and ingestion resource use**. SDB-10 must close as part of the Bookmark
remediation harness before the final pre-UI performance gate.
