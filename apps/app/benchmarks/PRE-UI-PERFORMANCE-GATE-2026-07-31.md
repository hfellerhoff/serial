# `apps/app` pre-UI performance gate — 2026-07-31

## Decision and approval request

**Conclusion: pass.** The final pre-UI Bookmark foundation is within the
repository's server, client, persistence, render, memory, and network budgets.
Every required local comparison is below the exact 1.5× ceiling, all structural
guards pass, the production Chromium profile passes, and the complete app test
suite is green.

After required pull-request CI is green, the requested human decision is:
**approve this performance gate and its merge into `beta` so Bookmark UI work
may begin.** This report does not authorize or perform that merge.

The measured product commit is `8f5c0c2d`. The branch adds audit enforcement,
evidence, and one synchronization-correctness fix discovered by the full-suite
run; it adds no Bookmark UI.

## Gate summary

| Evidence                        | Result                          | Strongest observed value / budget              |
| ------------------------------- | ------------------------------- | ---------------------------------------------- |
| Server latency matrix           | Pass, 18/18 local cells         | 1.39× p95 / 1.50×                              |
| Server row materialization      | Pass, 18/18 local cells         | 75 rows / 100–408                              |
| Network-protocol matrix         | Pass, 6/6 cells                 | 1.05× p95 / 1.50×                              |
| Client synchronous operations   | Pass, all three scales          | 24.42 ms / 50 ms                               |
| Sync request / response page    | Pass                            | 2.68 KiB / 16 KiB; 35.20 KiB / 256 KiB         |
| Normalized persistence mutation | Pass                            | 10.63 KiB / 512 KiB                            |
| Page retention                  | Pass, stable at 12 and 24 pages | 8 memory pages; 6 IndexedDB pages              |
| Production Chromium             | Pass                            | 0 long tasks; 10.1 ms max React commit / 50 ms |
| Full unit suite                 | Pass                            | 43 files, 229 tests                            |
| Full self-hosted E2E            | Pass                            | 33 passed, 1 intentional skip                  |
| Static/build checks             | Pass                            | typecheck, format, lint, build, React Doctor   |

## Server and database evidence

The generated query inventory contains 476 direct database operations across
the configured `apps/app` server, task, test, and benchmark scopes. Its checked
form passes after regeneration; the only final diff is seven line-number shifts
caused by adding the visibility revision to `initialRouter`. The audit ledger's
SDB-01 through SDB-10 findings are resolved by bounded mixed SQL windows,
on-demand scope loading, point/set-based Bookmark publication, indexed query
shapes, bounded legacy and organization work, bounded refresh/ingestion, and
the executable operation matrix.

The clean local SQLite matrix covers small, representative, and stress fixtures,
warm and cold caches, and unread, read, and later visibility:

| Profile        |    Cells | Median ratio range | p95 ratio range | Candidate rows / budget |
| -------------- | -------: | -----------------: | --------------: | ----------------------: |
| Small          | 6/6 pass |        1.26×–1.34× |     1.19×–1.39× |             61–73 / 100 |
| Representative | 6/6 pass |        1.13×–1.29× |     1.16×–1.28× |                75 / 198 |
| Stress         | 6/6 pass |        1.18×–1.31× |     1.19×–1.35× |                75 / 408 |

All cells preserve bounded `limit + 1` candidate queries, stable indexed query
plans, fixed statement shapes, bounded returned rows, and page-sized
application materialization. The stress result does not grow candidate rows
with the 50,000 Feed items and 5,000 Bookmarks in its fixture.

Machine-readable artifacts:

- [small local matrix](results/pre-ui-local-small-8f5c0c2d.json)
- [representative local matrix](results/pre-ui-local-representative-8f5c0c2d.json)
- [stress local matrix](results/pre-ui-local-stress-8f5c0c2d.json)
- [representative network-protocol matrix](results/pre-ui-turso-dev-representative-8f5c0c2d.json)

The network-protocol run uses a separate `turso dev` process over HTTP/libSQL,
not the in-process local SQLite adapter. Its six ratios range from 0.96× to
1.01× at median and 0.92× to 1.05× at p95, with the same 75/198 row bound.
There is no material divergence from local results; protocol overhead affects
both comparator and candidate similarly.

**Limitation:** `DATABASE_URL` and `DATABASE_AUTH_TOKEN` were unavailable, so
this run does not claim hosted, geographically remote Turso tail-latency
coverage. It validates the production network protocol and serialization path
locally. Structural limits and paired ratios remain the release gate because
they are deterministic and independent of network geography.

## Client, synchronization, and persistence evidence

The checked client coverage ledger contains an explicit result for all 316
applicable client/shared files. CL-01 through CL-05 are resolved: entity-only
events avoid projection work, reconnect and persistence are incremental,
Feed-item reader state is isolated from list projection, retained pages plateau,
and production rendering stays below hard budgets.

The final deterministic profiles all pass:

- [small client profile](results/pre-ui-client-small-8f5c0c2d.json)
- [representative client profile](results/pre-ui-client-representative-8f5c0c2d.json)
- [stress client profile](results/pre-ui-client-stress-8f5c0c2d.json)

At stress size, the largest synchronous operation is the batched 100-item Feed
progress update at 24.42 ms. Bookmark progress, capture, and 100-event burst
paths cause zero mixed projection notifications and zero authoritative refills.
Warm synchronization causes no notifications or refills. Cold synchronization
commits once. Bookmark save/delete each refill one affected scope, and an
organization change refills only its two changed scopes.

The fixed 64-bucket digest request is 2,743 bytes at every scale. The largest
response page grows only with its bounded changed bucket and is 36,049 bytes at
stress size. A normalized mutation writes 10,881 bytes. After both 12 and 24
loaded pages, retention remains at eight memory pages, 240 entities/references,
about 130 KiB modeled heap, six IndexedDB pages/about 90 KiB, and 180 mounted
items.

## Production Chromium evidence

The [production Chromium artifact](results/browser-client-representative.json)
was captured from the production build against the representative self-hosted
fixture. Every scenario passes its 50 ms long-task and React-commit budgets,
128 MiB heap budget, 16 MiB storage budget, and scenario-specific request and
IndexedDB budgets.

| Scenario            |     Usable content | Long tasks | Worst React commit | RPC requests / transfer |
| ------------------- | -----------------: | ---------: | -----------------: | ----------------------: |
| Cold load           |           1,108 ms |          0 |             6.7 ms |            7 / 1.47 MiB |
| Warm hydration      |             197 ms |          0 |            10.1 ms |           7 / 254.7 KiB |
| Reconnect           | observation window |          0 |             6.0 ms |           6 / 319.0 KiB |
| Pagination          | observation window |          0 |             6.1 ms |                 1 / 9 B |
| Native reader       |              57 ms |          0 |             7.9 ms |                 1 / 0 B |
| Page-capture reader |              68 ms |          0 |             6.0 ms |                 1 / 0 B |

The profile reports 47.4 MB heap. Storage stays between 4.50 and 4.65 MiB.

## Regression guards and discovered race

`client-audit-model.test.ts` deliberately injects over-budget duration,
notification, refill, payload, retention, and mounted-item measurements. Each
is rejected, proving the CI guard fails for unbounded query/fan-out-style client
regressions rather than merely replaying a known-good artifact. Server tests
likewise assert statement counts, materialized rows, plan shape, input caps,
and the exact 1.5× contract.

The first full E2E run exposed an order-dependent pre-existing undo race. A
background visibility response could start before an optimistic watched-state
mutation, arrive after undo, and replace the active scope with its stale empty
membership. Instrumentation reproduced the ordered failure 3/5 times. The fix
adds a monotonic membership revision to visibility requests/responses and
rejects responses older than the current mutation revision. The deterministic
unit regression passes, the ordered E2E sequence passes 20/20 repetitions, and
the complete self-hosted suite passes with both undo cases in their original
order.

## Verification record

| Check                                      | Result                                    |
| ------------------------------------------ | ----------------------------------------- |
| `pnpm benchmark:inventory:check`           | Pass; 476 operations inventoried          |
| `pnpm benchmark:client:coverage:check`     | Pass; 316 applicable files covered        |
| Small/representative/stress server gates   | Pass; 18/18 cells                         |
| Small/representative/stress client gates   | Pass                                      |
| Production Chromium performance E2E        | Pass; 1/1                                 |
| App unit tests, serialized                 | Pass; 43 files / 229 tests                |
| Self-hosted E2E, serialized                | Pass; 33 passed / 1 skipped               |
| Root typecheck                             | Pass; 6/6 packages                        |
| Root lint                                  | Pass; 0 errors / 30 pre-existing warnings |
| Root formatting                            | Pass                                      |
| Root production build                      | Pass; 4/4 build targets                   |
| React Doctor, changed scope against `beta` | Pass; no issues found                     |
| `git diff --check`                         | Pass                                      |

The initial sandboxed unit attempt could not bind four local RSS fixture ports
and timed out with `listen EPERM`; the identical serialized command passed once
run with local-port permission. This is an execution-environment restriction,
not a product failure.

## Residual risk and disposition

No unresolved server/database or client/synchronization audit finding blocks UI
work. The hosted geographic-network limitation above is explicitly accepted as
residual evidence risk only if the human approves this gate. Required PR CI and
human approval remain mandatory; the ticket must stay claimed until both are
complete and the branch is merged into `beta`.
