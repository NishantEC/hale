# Rust pipeline worker — consolidated design (2026-05-25)

This spec subsumes three previously-tracked workstreams:

- **Pipeline reliability + correctness** (the "five-stream" review from 2026-05-24)
- **App / backend retention parity + backend-owned pipeline triggering**
- **The data-volume + activity-classifier honesty audit** (this session)

Single source of truth from this point on; the memory pointer
`project_pubsub_pipeline_spec.md` resolves here.

---

## 1. The problem (single statement)

NestJS owns too much. The 10-minute pipeline runs in-process on the
request-handling Cloud Run instance, pegs CPU, starves user requests,
and dies non-durably (orphan `pipeline_runs` rows block dedupe). The
`raw_sensor_records` table is unbounded. Sleep numbers can't be
trusted because the input data is incomplete. The mobile app polls;
the auth path is a hack; the activity classifier was lying because
the data it needed never existed in historical packets.

Two things converge to the same fix: **move the pipeline into a
separate Rust worker with direct DB access, and reform the storage
layer underneath it**.

## 2. Target architecture

```
Mobile ──HTTPS──► NestJS ──Cloud Tasks enqueue──► noop-pipeline-worker (Rust)
                  │                                       │
                  │                                       ▼
                  └──TypeORM──► Postgres ◄────sqlx────────┘
                  (ingest writes,                  (full DB ownership of
                  view reads only)                  raw → derived; lease +
                                                    heartbeat on pipeline_runs)

                  NestJS still calls compute-engine HTTP for one-off
                  math from view handlers — that contract stays useful.
```

Two Rust binaries from the same `apps/compute-engine/` workspace:

| Binary | Mode | DB? | Triggered by |
|---|---|---|---|
| `noop-compute-engine` | HTTP service (existing) | No | NestJS HTTP |
| `noop-pipeline-worker` (new) | Cloud Tasks consumer | sqlx | Cloud Tasks |

Shared algorithm code in `src/math/`. Independent deployment + autoscaling.

## 3. Contracts (the "independent C contract")

| Edge | Protocol | Owner |
|---|---|---|
| Mobile ↔ NestJS | HTTPS / JSON | NestJS (existing API, unchanged) |
| NestJS ↔ Postgres (writes) | TypeORM | NestJS — **only** ingest paths |
| NestJS ↔ Postgres (reads) | TypeORM | NestJS — view assembly |
| NestJS → Cloud Tasks | enqueue `{userId, runId, timeZone, since}` | NestJS |
| Cloud Tasks → Worker | HTTP POST w/ OIDC | GCP |
| Worker ↔ Postgres | sqlx | Rust worker |
| Worker → NestJS | **none — DB is the integration point** | n/a |
| Schema migrations | TypeORM | NestJS; Rust uses `sqlx::query!` for compile-time check |

Two invariants stay rigid: **TypeORM owns schema + migrations**, and
**no cross-service callbacks** — the DB is the bus.

## 4. Workstreams

### Phase A — Contract first (1–2 weeks)

| ID | Item | Owner |
|---|---|---|
| 0.1 | `/pipeline/ingest-table` idempotency on `(tableName, rowId)`; integration test | NestJS |
| A.1 | `src/bin/worker.rs` axum scaffold responding to Cloud Tasks OIDC POST | Rust |
| A.2 | sqlx setup with `DATABASE_URL`, compile-time query checks, shared pool | Rust |
| A.3 | NestJS replaces `void runPipelineAsync()` with Cloud Tasks enqueue (existing in-process path stays as fallback gated by env flag) | NestJS |
| A.4 | First worker stage: per-day input fingerprint (read raw, write fingerprint, return). Smallest end-to-end loop. | Rust |
| A.5 | Lease + heartbeat on `pipeline_runs`. Stale recovery (`heartbeat < now-5min AND status='running'` → `failed`) runs in NestJS as a cron. | Both |

### Phase B — Move compute into worker (2–3 weeks, after A)

| ID | Item |
|---|---|
| B.1 | Port `sleep-detect` to Rust worker |
| B.2 | Port `activity-detect` (parallel with B.1 via `tokio::join!`) |
| B.3 | Port `sleep-stages` |
| B.4 | `derived_metrics` already in Rust — move from HTTP-stateless to in-process inside worker |
| B.5 | NestJS pipeline.service.ts shrinks to: enqueue + read views |

Migration discipline per stage:
1. Port logic to Rust under a feature flag
2. Run both sides on the same input (parity test, already infra exists in `tests/golden.rs`)
3. Gate the cutover behind `WORKER_OWNS_<STAGE>=true`
4. Once green for a week, delete the TS code path

### Phase C — Storage layer reform (parallel with B)

| ID | Item | Owner |
|---|---|---|
| C.1 | `raw_sensor_records_minute` table — 12 aggregate cols, populated at ingestion in NestJS | NestJS |
| C.2 | Day-partition `raw_sensor_records` (`PARTITION BY RANGE (timestamp)`, monthly child partitions) | DBA |
| C.3 | Retention sweeper (all 7 tables) — runs in Rust worker on cron | Rust |
| C.4 | `dayRibbon.hrSeries` reads from `raw_sensor_records_minute` — 14k rows → 96 | NestJS |
| C.5 | Drop derived `signal_samples` persistence — redundant once C.1 lands | NestJS |
| C.6 | (Optional, deferred) TimescaleDB extension if scale demands | DBA |

Per-table retention policies:

| Table | TTL | Gate |
|---|---|---|
| `raw_sensor_records` | 30 d | `night_features` exists for the day |
| `raw_sensor_records_minute` | 1 yr | always |
| `signal_samples` | drop entirely once C.1 lands | n/a |
| `realtime_samples` | 14 d | always |
| `device_events` | 180 d | always |
| `console_logs` | 7 d | always |
| `journal_entries` | forever | n/a (user data) |

### Phase D — Observability + ownership shift (1 week)

| ID | Item |
|---|---|
| D.1 | Per-user uplink queue depth + oldest-pending-age metric |
| D.2 | Per-table mark-synced failure rate |
| D.3 | Pipeline-run telemetry (heartbeat, stage timings, error rate) via `/views/*` |
| D.4 | Alert: any user `oldest_pending_at > 24h` |
| D.5 | Backend-owned pipeline trigger live: post-ingest debounce (per-user, 10 s coalesce) + 15 min cron fallback |
| D.6 | Drop public `/pipeline/run`; keep admin-scoped behind auth for Inspector debug button |

### Phase E — Correctness + client polish

| ID | Item |
|---|---|
| E.1 | Sleep-detection ground-truth audit (only meaningful after A+B+C) |
| E.2 | HRV / RHR derivation validation |
| E.3 | `/views/*` caching (Memorystore or in-process LRU) |
| E.4 | APNs silent push replaces mobile `awaitPipelineRun` polling |
| E.5 | Priority lanes in mobile semaphore (foreground UI / sync / background) |
| E.6 | JWT refresh + drop `Origin: http://localhost:3009` better-auth hack |

### Already shipped this session

| ID | Item | Commit |
|---|---|---|
| 6.1 | MonitorCard UH glow | `641f64f9` |
| 6.2 | CandidateCard UH glow + swipe + Dismiss/Confirm | `641f64f9` + `d00d8401` |
| 6.3 | DayArcRibbon (full stack, `dayRibbon` field on HomeViewModel) | `641f64f9` |
| 6.4 | Activity classifier honest labels (Sedentary / Rest / Exercise / Light), cadence-gated dead branches dropped | `812b5dd2` |

## 5. DB-level wins unlocked by direct sqlx access

| Optimization | Win | How |
|---|---|---|
| Day-partitioning `raw_sensor_records` | Pruning = `DROP PARTITION` (instant, no VACUUM); queries auto-narrow | Native Postgres `PARTITION BY RANGE` |
| `COPY` for bulk ingest | 3–5× faster ingest | sqlx `copy_in_raw()` |
| Prepared statements w/ type-check | Lower latency + compile-time safety | `sqlx::query!` macros |
| Per-service connection pools | Worker holds 5–10, NestJS holds 2–3 | `sqlx::PgPool::builder()` |
| Server-side aggregation for `raw_sensor_records_minute` | Aggregation pushed to DB, not pulled into worker memory | `INSERT … SELECT date_trunc + AVG/STDDEV … GROUP BY` |
| `LISTEN/NOTIFY` for "raw rows ingested" | Worker reacts without polling | NestJS `NOTIFY` on ingest, worker `LISTEN` |

## 6. Open decisions (call before Phase A starts coding stages)

- **Rust DB layer:** sqlx (recommended — raw SQL, async-first, compile-time check, smallest mental load) vs sea-orm vs diesel
- **Enqueue transport:** Cloud Tasks (recommended — HTTP delivery, OIDC, retry/DLQ, per-task dedupe key) vs PubSub
- **Worker deployment:** Cloud Run service (recommended — autoscale to zero, Cloud Tasks → HTTP POST is the native pattern) vs Cloud Run Job
- **Partitioning:** native Postgres (sufficient for the next year) vs TimescaleDB (overkill until 50+ users)
- **Migration ownership:** TypeORM stays canonical; Rust adds a `sqlx-cli` schema-check step in CI to detect drift

## 7. Non-goals

- Don't rewrite to Rust for CPU reasons. The bottlenecks are architectural (10-min in-process compute on the request tier, unbounded raw table, polling mobile). The CPU win from Rust is a bonus.
- Don't go to Kubernetes / microservices for their own sake. Cloud Run + Cloud Tasks is the right shape.
- Don't duplicate the schema in Rust. TypeORM owns it; sqlx reads it.
- Don't make NestJS chatty with the worker. DB is the bus.

## 8. Safety / migration discipline

> User constraint: "no users yet, downtime is okay, functionality should be fine."

That makes the migration easier — but functional regressions are still not okay. Discipline:

1. **Worker is purely additive in Phase A.** New binary, new Cloud Run service, new Cloud Tasks queue. NestJS in-process pipeline keeps working until explicitly cut over.
2. **Per-stage feature flags** for Phase B. Each migration is `WORKER_OWNS_<STAGE>=true`; flip back if anything wrong.
3. **Parity tests** before cutover. The existing `tests/golden.rs` infrastructure extends to per-stage golden fixtures.
4. **DB-level changes (Phase C) are backward-compatible**: `raw_sensor_records_minute` is a new table, day-partitioning is a re-table that keeps the same column shape, retention sweeper is gated on `night_features` existing for the day.
5. **One stage at a time**. No big-bang cutover.

## 9. What "done" looks like

- A Cloud Run instance dying mid-pipeline never strands a user
- `raw_sensor_records` has a stable size profile, not unbounded growth
- `raw_sensor_records_minute` carries the long-tail query load
- Backend owns pipeline cadence; app only consumes status
- `/pipeline/ingest-table` is provably idempotent on `(tableName, rowId)`
- Per-user observability: queue depth, oldest-pending-age, mark-synced failure rate, pipeline-run latency
- Sleep numbers demonstrably correct against ground truth on a complete night
- Activity bouts honestly labelled with HealthKit overriding when present, user labelling otherwise (shipped)
- A new user signing up doesn't degrade the existing user's experience
- The mobile app survives 10 min in a subway tunnel without losing data

## 10. Sizing

- Phase A: 10–14 dev-days
- Phase B + C in parallel: 4–6 weeks
- Phase D: 1 week (parallel with C)
- Phase E: 5–7 days
- **Total path: ~6–8 weeks of focused work.**

## 11. First ship (proof of concept)

The minimal end-to-end that de-risks everything:

1. `apps/compute-engine/src/bin/worker.rs` — axum endpoint listening for Cloud Tasks OIDC POST
2. sqlx setup — reads `raw_sensor_records` for a user, returns row count + max(timestamp)
3. NestJS `/pipeline/run` enqueues a Cloud Task (in-process fallback stays gated)
4. Lease + heartbeat on `pipeline_runs` — Rust writes, NestJS reads for status

Once that one round-trip works (mobile triggers → NestJS enqueues → Cloud Task delivers → Rust worker reads DB → writes status), every subsequent stage migration is repeatable.
