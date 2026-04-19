# Backend `?since=` Endpoints for SQLite Mirror Downlink

**Dependency of:** `docs/superpowers/specs/2026-04-18-local-sqlite-mirror-design.md`

**Consumer:** `app/app/services/sync/downlinkPuller.ts` on the `feat/local-sqlite-mirror` branch.

## Required routes

Add `GET /sync/<table_name>?since=<unix-ms>&limit=<int>` for each downlink table. Response shape:

```json
{
  "rows": [{ "...": "entity fields", "updatedAt": 1700000000000 }],
  "hasMore": false
}
```

- **Filter:** rows where `updatedAt > since` for the requesting user (auth session enforces userId scoping).
- **Order:** `updatedAt` ascending, secondary `id` ascending (stable pagination).
- **Limit:** `limit` query param, default **1000**, max **5000**.
- **`hasMore`:** `true` if more rows exist past the response tail; the client will keep calling with the new `since=maxUpdatedAt` until `hasMore=false` or `rows.length === 0`.
- **Timestamps:** `updatedAt` is **unix milliseconds**, matching what the client persists in `sync_state.last_sync_at`.

## Tables the app pulls

| `table_name` in URL | Backend entity | Source of `updatedAt` |
|---|---|---|
| `daily_metrics` | `DailyMetric` | `@UpdateDateColumn` |
| `daily_scores` | `DailyScore` | `@UpdateDateColumn` |
| `sleep_detections` | `SleepDetection` | `@UpdateDateColumn` |
| `sleep_stages` | `SleepStage` | `@UpdateDateColumn` |
| `night_features` | `NightFeature` | `@UpdateDateColumn` |
| `signal_samples` | `SignalSample` | derive from `timestamp` if no update column |
| `activity_detections` | `ActivityDetection` | `@UpdateDateColumn` |
| `baseline_profile` | `BaselineProfile` | `@UpdateDateColumn` |
| `sleep_plans` | `SleepPlan` | `@UpdateDateColumn` |

**Migration note:** entities that don't already have an `updatedAt` column need one (TypeORM's `@UpdateDateColumn`). The same migration that adds these routes should add the columns.

## Why not reuse existing list endpoints

Existing endpoints like `/pipeline/results` return everything with no since filter. Fetching everything on every foreground cycle is wasteful and scales poorly past a few weeks of data. The app needs an incremental pull keyed on `updatedAt`.

## Row payload shape

The client `upsert*` helpers in `app/app/services/db/repositories/derived.ts` accept whatever fields the backend returns and persist them to SQLite with the same column names. Keep the property names in sync with the TypeORM entity columns (camelCase on the wire, as all existing endpoints already use).

Backend-private columns (e.g. `createdAt` on entities without a matching mirror column) may be omitted or included — the client's `upsertMany` spreads the entire row into Drizzle's `values(...)` but relies on Drizzle to ignore unknown columns.

## Testing

- **Per-table unit test:** seed 10 rows with `updatedAt` 1..10, call `?since=5`, assert only rows 6..10 returned, ordered ascending.
- **Pagination:** seed 50 rows, call `?limit=20&since=0`, assert `hasMore=true` and `rows.length === 20`; call again with `since=<maxUpdatedAt_of_first_page>`, assert cursor advances without duplicates.
- **Auth scoping:** seed rows for user A and user B, call with A's session, assert no B rows returned.
- **401:** call without a session, assert 401.

## Client contract

The client behavior against these endpoints is already implemented on `feat/local-sqlite-mirror`:

```typescript
// app/services/sync/downlinkPuller.ts
let since = await getLastSyncAt(db, tableName)
for (;;) {
  const { rows, hasMore } = await apiGet(`/sync/${tableName}?since=${since}&limit=1000`)
  if (rows.length === 0) break
  await upserter(db, rows)
  since = Math.max(...rows.map((r) => r.updatedAt ?? since))
  await setLastSyncAt(db, tableName, since)
  if (!hasMore) break
}
```

A backend PR implementing the routes above lets Phase 3 of the local SQLite mirror ship end-to-end. Until then, `SyncService.pullFn` silently fails over the non-existent routes and the app still functions — screens render from view_cache whenever it's populated (populated by the server's existing `/views/*` endpoints that are already called from `DashboardContext` and `TrendsScreen`).

---

**Owner:** backend PR, separate from the app-side feat/local-sqlite-mirror branch.
**Blocker for:** full end-to-end Phase 3 behavior; the app branch can merge and ship without it, but `pullDownlink` will be a no-op until the routes exist.
