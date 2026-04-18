# Local SQLite Mirror Design

**Date:** 2026-04-18
**Goal:** Give the Expo app a durable on-device SQLite database that mirrors every WHOOP watch event and every derived backend value the UI renders, so history is readable offline and no event is ever silently dropped.

---

## Overview

Today the app forwards BLE data straight to the NestJS backend via `apiPost('/pipeline/ingest', …)` and reads everything it shows through `fetch*View` calls. If the backend is unreachable, data is lost; if the network is slow, the UI blocks.

This feature introduces a local SQLite database that:

1. **Uplink buffer** — every BLE packet decoded by the app is written to SQLite *first*, then forwarded to the backend from a durable queue. Network failures don't lose data.
2. **Downlink mirror** — derived results the backend computes (metrics, sleep events, scores, journal, baseline, view models) are pulled into SQLite on app foreground + pull-to-refresh. Screens read from SQLite exclusively.
3. **Single source of truth for the UI** — no screen calls the backend directly for display. Screens subscribe to SQLite; the sync layer fills SQLite.

The backend remains authoritative for derived values (sleep stages, scores, correlations). The app never computes those locally; it just caches them.

---

## Section 1: Library Choices

| Concern | Pick | Why |
|---|---|---|
| SQLite engine | `expo-sqlite` (already bundled with Expo SDK 55) | Official, aligns with "use Expo where we can", zero native-build surgery |
| Query layer | `drizzle-orm` with the `drizzle-orm/expo-sqlite` driver | Typed schemas, migrations via `drizzle-kit`, no hand-written SQL strings as the schema grows |
| Migrations | `drizzle-kit generate` → SQL files committed to git; applied at app startup via Drizzle's `useMigrations` hook | Deterministic, versioned, diffable |
| Background task runner | Simple in-process async loop (setInterval + app-state listener); `expo-task-manager` only if we later need true background execution | Keeps this feature self-contained |

**Not chosen:** `op-sqlite` (faster JSI-based engine — but third-party, adds maintenance, and BLE write throughput doesn't need it); `Kysely` / raw SQL (less ergonomic than Drizzle for this schema size); `WatermelonDB` (heavier, opinionated sync model we don't need).

---

## Section 2: Architecture

```
app/
  services/
    db/
      index.ts              // open/close DB, run migrations
      schema.ts             // Drizzle table definitions
      migrations/           // drizzle-kit generated SQL
      repositories/
        rawSensorRecord.ts
        derivedMetric.ts
        sleepEvent.ts
        journalEntry.ts
        baselineProfile.ts
        viewCache.ts        // HomeViewModel / SleepViewModel / TrendsViewModel cached JSON
        outboundQueue.ts    // pending uplink rows
        syncState.ts        // per-table lastSyncAt
    sync/
      SyncService.ts        // orchestrates uplink drain + downlink pull
      uplinkDrainer.ts      // reads outboundQueue, POSTs, marks synced
      downlinkPuller.ts     // calls backend GET endpoints with since=lastSyncAt, upserts
      retentionSweeper.ts   // enforces user-configured retention window
    api/
      noopClient.ts         // unchanged HTTP layer; now called only by sync layer
    settings/
      retentionSettings.ts  // user-configurable retention (7 / 30 / 90 / forever days)
```

**Key rule:** screens never import from `services/api`. They import repository functions from `services/db` and call `SyncService.refresh()` on focus / pull-to-refresh.

---

## Section 3: Schema

### Mirrored tables (shape follows backend TypeORM entities)

Each mirrored table adds three columns the backend doesn't have:

- `_syncedAt` (int, unix ms, nullable) — when backend ack'd this row (null = pending uplink)
- `_localCreatedAt` (int, unix ms) — when app first wrote the row
- `_origin` (text: `"local"` | `"backend"`) — `local` for rows the app originated, `backend` for downlinked rows

**Tables:**

| SQLite table | Backend entity | Origin | Notes |
|---|---|---|---|
| `raw_sensor_records` | `RawSensorRecord` | local | Uplink. Bulk-insert path, high write rate. |
| `realtime_samples` | `RealtimeSample` | local | Uplink. |
| `device_events` | `DeviceEvent` | local | Uplink. |
| `console_logs` | `ConsoleLog` | local | Uplink (debug telemetry). |
| `journal_entries` | `JournalEntry` | local | Uplink; user-created. |
| `daily_metrics` | `DailyMetric` | backend | Downlink. |
| `daily_scores` | `DailyScore` | backend | Downlink. |
| `sleep_detections` | `SleepDetection` | backend | Downlink. |
| `sleep_stages` | `SleepStage` | backend | Downlink. |
| `night_features` | `NightFeature` | backend | Downlink. |
| `signal_samples` | `SignalSample` | backend | Downlink (derived from raw on backend). |
| `activity_detections` | `ActivityDetection` | backend | Downlink. |
| `baseline_profile` | `BaselineProfile` | backend | Downlink; single row per user. |
| `sleep_plans` | `SleepPlan` | backend | Downlink. |

### View-model cache (new, no backend equivalent)

| SQLite table | Purpose |
|---|---|
| `view_cache` | Stores the most-recent `HomeViewModel` / `SleepViewModel` / `TrendsViewModel` / `DebugOverview` JSON blobs keyed by `(viewName, date)`. Lets screens render instantly from SQLite while a fresh fetch runs in the background. |

### Sync-tracking tables (new, local-only)

| SQLite table | Columns | Purpose |
|---|---|---|
| `outbound_queue` | `id` (uuid), `tableName` (text), `rowId` (uuid), `payload` (json), `attempts` (int), `lastAttemptAt` (int), `lastError` (text, nullable), `createdAt` (int) | Durable FIFO of rows pending POST to backend. Populated by uplink writes; drained by `uplinkDrainer`. |
| `sync_state` | `tableName` (text, PK), `lastSyncAt` (int, unix ms), `lastSyncedRowTimestamp` (int, unix ms, nullable) | Per-table cursor for `?since=…` downlink pulls. |
| `settings` | `key` (text, PK), `value` (text) | Key/value for retention window and future settings. |

---

## Section 4: Data Flow

### 4.1 Uplink (BLE packet → local → backend)

```
BLE packet arrives (bleService.ts)
  ↓
Decode to RawSensorRecord shape
  ↓
db.transaction:
    INSERT INTO raw_sensor_records (...)  -- _syncedAt = NULL, _origin = 'local'
    INSERT INTO outbound_queue (tableName='raw_sensor_records', rowId, payload)
  ↓
UI/charts immediately reflect the row (read from SQLite)
  ↓
SyncService.uplinkDrainer (runs every N seconds while network reachable):
    SELECT ... FROM outbound_queue ORDER BY createdAt LIMIT 500
    Batch-POST to backend endpoint (e.g. /pipeline/ingest)
    On 2xx: UPDATE row SET _syncedAt = now; DELETE FROM outbound_queue
    On 5xx / network error: increment attempts, keep in queue, exponential backoff
    On 4xx: move to dead-letter state (attempts >= 10) and surface in debug screen
```

Uplink tables (`raw_sensor_records`, `realtime_samples`, `device_events`, `console_logs`, `journal_entries`) follow identical shape — the `outbound_queue` is table-agnostic.

### 4.2 Downlink (backend → local)

```
Trigger: app state → foreground | pull-to-refresh | screen mount
  ↓
SyncService.refresh():
    For each downlink table:
      since = sync_state.lastSyncAt
      GET /<table>?since=<since>
      Upsert rows (ON CONFLICT(id) DO UPDATE) -- _origin = 'backend', _syncedAt = now
      Update sync_state.lastSyncAt
    Also refresh view_cache:
      GET /views/home?date=... /views/sleep?date=... etc
      UPSERT INTO view_cache
```

**Backend work required** (separate backend spec, not this one): add `?since=` query support to the entity list endpoints that don't have it yet. That's a small backend change; call it out as a dependency.

### 4.3 Screen reads

```
HomeScreen mount:
  view = viewCache.get('home', selectedDate)   // instant from SQLite
  render(view)
  SyncService.refresh()                         // background, fire-and-forget
  view_cache write triggers re-render via observable (see §5)
```

Screens never call `noopClient.fetchHomeView` directly anymore.

---

## Section 5: Reactivity

Drizzle doesn't ship a reactive-query primitive out of the box. Two options:

- **Simple:** expose a small `observe(queryKey, fn)` wrapper in each repository. After any write that touches that table, notify subscribers. Screens use a `useDbQuery` hook.
- **Library:** adopt TanStack Query with a SQLite-backed queryFn. More dependencies, more control; probably worth it if we add many more reactive screens.

**Recommendation:** ship with the simple wrapper first. Migrate to TanStack Query only if we outgrow it. Keep this behind the repository interface so the swap is local.

---

## Section 6: Retention

User-facing setting in Device Settings / Debug: **"Keep history for"** with options `7d / 30d / 90d / forever` (default **30d** for raw tables, **forever** for derived + view cache).

`retentionSweeper` runs once per app foreground:

```sql
DELETE FROM raw_sensor_records
WHERE timestamp < now - <window> AND _syncedAt IS NOT NULL;
```

Only `_syncedAt IS NOT NULL` rows are eligible — we never delete pending uplink rows regardless of age.

Derived tables and `view_cache` are never swept (small footprint, expensive to re-fetch).

---

## Section 7: Migration & Rollout

Phased, each phase independently shippable:

**Phase 1 — DB scaffolding**
- Add `expo-sqlite`, `drizzle-orm`, `drizzle-kit` deps
- Write `schema.ts`, generate initial migration, add `db/index.ts` with `useMigrations` hook
- Wire into `app.tsx` (open DB before children mount; show splash on migration)
- No feature change; CI passes `tsc --noEmit`

**Phase 2 — Uplink for raw sensor records**
- Add repositories + outbound_queue + SyncService.uplinkDrainer
- Change the BLE ingest path in `bleService` to write-local-first
- Old behavior still works; backend still receives data (via drainer)
- Verify: airplane-mode test → no data loss → backend catches up on reconnect

**Phase 3 — Downlink for derived tables + view cache**
- Add downlinkPuller, backend `?since=` endpoints (separate backend PR)
- Populate view_cache
- Flip `HomeScreen` / `SleepScreen` / `TrendsScreen` to read from repositories + view_cache
- `DebugScreen`: add "Local DB" inspector showing row counts + queue depth + sync state

**Phase 4 — Remaining uplink tables**
- Journal entries, telemetry events, realtime samples, console logs
- Each screen migrated one-by-one

**Phase 5 — Retention**
- Settings screen row + retentionSweeper
- Default 30d raw / forever derived

---

## Section 8: Testing

- **Unit:** repository functions (insert/upsert/select) against an in-memory SQLite (`expo-sqlite`'s `:memory:` mode in jest). Schema round-trips for every mirrored entity.
- **Integration:** a "sync scenarios" test harness that simulates airplane-mode → writes → reconnect → drain. Asserts zero data loss and eventual consistency with a mocked backend.
- **Migration:** snapshot test — open v1 DB, run migration, verify schema matches v2 generated.
- **Manual regression:** Debug screen gets a "Sync Diagnostics" panel showing queue depth, last successful drain, last pull per table. Every phase's PR includes a screenshot of that panel.

---

## Section 9: Open Questions (to resolve during implementation)

1. **User identity in local schema.** Backend rows have `userId`. On-device, the app is single-user but we still need to tag rows so switching accounts doesn't mix data. Proposal: store the active `userId` in the session and include it on every write; wipe DB on logout.
2. **Conflict policy on downlink.** If a row was written locally (`_origin='local'`, `_syncedAt=null`) and the backend returns a row with the same `id` via downlink, we take backend's version and clear the queue entry. Document this.
3. **View cache invalidation on new raw data.** When raw data arrives and is uplinked, the backend will eventually produce fresher view models. Right now nothing tells the app "your home view is stale". For now, refresh view_cache on every foreground and accept up to one foreground-cycle of staleness. Revisit if users complain.
4. **Bundle size.** Adding Drizzle + expo-sqlite is ~200KB gzipped. Acceptable but track in the PR.
5. **Strap backfill size is runtime-discovered, not a fixed capacity.** The WHOOP 4.0 BLE protocol does not expose a static "N days of storage" constant. On sync initiation the strap sends `HistoryStart` (metadata code 1) with `count_u32_LE` = total records available, and the app drains until `HistoryComplete` (code 3). The `outbound_queue` handles backfill of arbitrary size, so no capacity assumption is baked into the schema. Community reverse-engineering puts practical on-strap buffer at ~3–7 days of V12/V24 full-sensor records (~6.3 MB/day at 1 Hz), but the app should never rely on that number — always trust the runtime count.

---

## Non-Goals

- **On-device derivation** of sleep stages, scores, correlations. Backend remains authoritative.
- **Multi-device sync.** Single device per user; no conflict resolution beyond backend-wins.
- **End-to-end encryption** of local DB. Data is already on the device; iOS/Android FS protections apply. Revisit if we add PII beyond what's already stored.
- **Background BLE ingestion when app is terminated.** Out of scope; BLE still runs only while app is active.

---

## Dependency on Backend

This spec requires one backend change (tracked separately):
- Add `?since=<unix-ms>` query parameter to the list endpoints the downlink puller needs (daily metrics, sleep detections, sleep stages, night features, signal samples, activity detections, journal entries, device events). Return rows with `updatedAt > since` ordered by `updatedAt` asc, capped at e.g. 1000 rows with a `hasMore` flag for pagination.

Without this, downlink would have to re-fetch everything on every refresh. Phase 3 blocks on that backend PR.
