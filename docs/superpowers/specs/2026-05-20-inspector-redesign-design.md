# Inspector Redesign Design

**Status:** Approved (v4)
**Author:** Nishant + Claude
**Date:** 2026-05-20

## Goal

Replace the current cluttered Inspector tab with a tight, well-organized diagnostic surface optimized for two audiences:

1. **You (primary):** debugging missing-data / sync issues with full expert tooling one tap away.
2. **Beta testers (secondary):** can screenshot the Inspector and share enough signal for you to diagnose remotely, without exposing the firmware-poking buttons.

Success criteria:

- A tester screenshot of the top of the Inspector tells you ~80% of the system's health.
- Active problems (gaps, daemon stopped, API failures) surface above the fold.
- Every action button on the default surface actually does something. Dead actions live behind an unlock.
- The Logs section can be copied and exported with one tap each.

## Non-Goals

- **Pipeline trigger architecture.** The current Inspector exposes a "Run Pipeline" button because triggering is currently client-side. This spec moves "Run Pipeline" into Expert mode but does **not** redesign pipeline orchestration. A separate spec will cover server-side scheduling (record-count threshold, post-wake-hour heuristic, last-run lease).
- **Logging volume / format.** This spec uses the existing `appendLog` API as-is.
- **Strap firmware behavior.** This spec acknowledges that current firmware ignores WHOOPSI rewind / force-trim commands but does not attempt to fix that.

## Architecture

The Inspector becomes a **single screen with two modes** and these stacked sections:

```
+--------------------------------------------+
| Header [Inspector]   [long-press → expert] |
+--------------------------------------------+
| Health strip — 4 chips (Strap, Phone,      |
|                Backend, Coverage ring)     |
+--------------------------------------------+
| SyncProgressCard (only when isSyncing)     |
+--------------------------------------------+
| Events (alerts + activity, sorted)         |
+--------------------------------------------+
| Daemon drilldown (collapsible via chip tap)|
+--------------------------------------------+
| Logs (today's tail + Copy + Export)        |
+--------------------------------------------+
| Actions (4 in one row)                     |
+--------------------------------------------+
| [Expert mode only] grouped expert actions: |
|   Diagnostics / Firmware probes / Danger   |
+--------------------------------------------+
```

Mode is local to the Inspector tab; long-press on the header toggles `expertMode` state. Expert mode does not persist across app restarts (resets to default each launch — intentional, so testers can't accidentally enable it permanently).

## Components

### 1. Health Strip — 4 chips in 1 row

Each chip:

- 6px status dot (top-right corner): `green` / `amber` / `red`
- 20px Phosphor icon
- Uppercase name
- 2-line sub-text (varies per chip)

#### Strap chip

- Dot color:
  - `green`: connectionState === "ready"
  - `amber`: connectionState === "connecting"
  - `red`: connectionState === "disconnected"
- Sub-text:
  - "on wrist · 38%" when connected + worn
  - "off wrist · 38%" when connected + off-wrist
  - "stream silent" when connected but no packets for >3min
  - "backlog · N chunks" when WHOOPSI backlog is queued
  - "—" when disconnected

#### Phone chip

- Dot color:
  - `green`: daemon running AND last tick < 90s ago
  - `amber`: daemon stopped (strap is ready) OR last tick > 90s ago
  - `red`: app errors detected (e.g., crash recovery, JS exceptions in last 5m)
- Sub-text: "daemon · N ticks" when running, "daemon stopped" when not.

#### Backend chip

- Dot color:
  - `green`: queue depth = 0, no API failures in last 5m, last sync < 10m ago
  - `amber`: queue depth > 0 OR last sync > 10m but < 1h
  - `red`: 2+ consecutive API failures OR last sync > 1h ago
- Sub-text: "synced 4m ago" or "N pending · M dead"

#### Coverage chip

- 42px ring chart (16 px radius, 4 px stroke), percent inside.
- Stroke color: green if today ≥ 80%, amber 50–79%, red < 50%.
- Tap navigates to coverage detail (future).

### 2. SyncProgressCard (conditional)

- Renders only when `isSyncing === true`.
- Shows: pass count ("pass 2 of 3"), bar (records drained / records expected), time range ("04:21 → 04:33") of current chunk.
- Subtle green border tint to distinguish from passive cards.
- Disappears when sync ends; no animation needed for v1.

### 3. Events card (alerts + activity merged)

A single card listing a recency-sorted stream. Each row has:

- 14px icon (warn / bad / ok colored)
- Title (one line)
- Sub-text (one line, dim)

**Row types:**

| Type            | Source                        | Tone | Example title                              |
| --------------- | ----------------------------- | ---- | ------------------------------------------ |
| API failure     | `syncTelemetry.apiFailures`   | warn | `API · POST /pipeline/ingest-table`        |
| Daemon stopped  | derived from daemon state     | warn | `Daemon stopped`                           |
| Detected gap    | `syncTelemetry.detectedGaps`  | warn | `149-min gap · today 16:05→18:34`          |
| Sync session    | `syncTelemetry.syncSessions`  | ok   | `Sync · 72 rec · caught_up`                |
| Pipeline run    | `syncTelemetry.lastPipelineRunAt` + duration | ok | `Pipeline · 2 stages`         |
| Persist failure | `syncTelemetry.persistFailures` | bad | `Persist failed · drizzle constraint`     |

Sort order: **all warn/bad rows first** (most recent first), then **ok rows** (most recent first). Cap at 10 total visible; expand-to-see-more not required for v1.

### 4. Daemon drilldown

A small card directly below Events, revealed by tapping the Phone chip (collapses by default). Shows 4 stats horizontally:

- `ticks` — total tick count since daemon start
- `skip busy` — ticks skipped because syncing was already in flight
- `skip disc.` — ticks skipped because BLE was disconnected
- `interval` — current daemon interval ("30s")

If daemon is stopped, the drilldown shows the stats from the most recent run with a dim "(last run)" suffix.

### 5. Logs card

- Section header has section title on the left, two icon-only buttons on the right:
  - **Copy** — copies the visible log tail to the clipboard, shows a brief "Copied" toast
  - **Export** — calls `expo-sharing` to hand off the file
- Tail body uses Menlo monospace, 10pt, colored by line level (warn=amber, err=red).
- Max height ~100px, scrolls internally; auto-refresh every 3s while expanded.

### 6. Actions row

Four buttons in a single grid row, vertical icon-above-label layout. All four are user-facing and each MUST do something visible:

1. **Sync** — calls `syncNow()`. Disabled while `isSyncing`.
2. **Refresh** — invalidates and re-fetches cached server views (existing handler in current `ActionsCard.onRefreshView`).
3. **Clear** — drops pending outbound queue rows. Confirmation alert ("This deletes N pending uploads, can't be undone") before executing.
4. **Upload** — forces an immediate drain of the outbound queue to the backend (existing `onForceUpload` handler).

### 7. Expert mode

Toggled by long-pressing the "Inspector" header. When active:

- Header title turns amber, EXPERT badge appears
- Below the default actions, three grouped sections appear:

**Diagnostics**

- Probe range — calls `probeDataRange()`
- Run pipeline — calls `triggerPipeline()` (legacy client-side trigger; remove after server-side scheduling lands)
- Web inspector — opens the existing web inspector

(3 buttons in this group; layout uses a 2-col grid so the last cell is empty — acceptable, no filler.)

**Firmware probes**

- Rewind ts (4B)
- Rewind ack (9B)
- Rewind bare
- WHOOPSI init

**Danger** (red treatment)

- Force trim legacy
- Force trim mvk (Maverick)
- Reboot strap
- Power-cycle

Expert mode resets on app launch (does not persist).

## Data Flow

All data is already exposed by:

- `BleContext` — connection state, on-wrist, battery, last stream packet timestamp
- `syncTelemetry` — sync sessions, API failures, persist failures, detected gaps, daemon stats, last pipeline run
- `continuousSyncDaemon.getContinuousSyncStats()` — running flag, ticks, skipped counters, interval
- `outboundQueueRepo` — depth, dead count

This redesign consumes the existing data; no new collection mechanisms.

The mapping of chip color and sub-text is done in derived selectors (one selector per chip), kept colocated with chip components.

## Error Handling

- **Logs Copy fails** — toast "Couldn't copy" and fall back to leaving the existing clipboard contents alone.
- **Logs Export fails** — toast "Couldn't export"; existing behavior already swallows the error.
- **Expert actions throw** — caught at the handler boundary; log to `appendLog` with category `ui`, level `error`. Toast generic "Action failed".
- **Daemon stats unavailable** — show "—" in stats; don't crash.

## Open Risks

1. **SyncProgressCard semantics during pass transitions.** The card currently flickers between passes (S2 work is mostly settled but pass transitions could briefly show stale progress). User flagged this concern. Implementation note: hold the visible state for ~500ms after a pass completes before moving to the next pass numbers, to avoid jitter.
2. **Long-press detection on a header.** iOS long-press conflicts with system gestures sometimes; we may need a tappable cog icon as a fallback. Document but proceed with long-press.
3. **"Stream silent" timing.** Threshold of 3min for declaring stream silent is a guess; tune after observing real-world data.

## Testing

- **Snapshot tests** for each chip in each state (12 chip-state combinations across 4 chips).
- **Selector unit tests** for the chip color/sub-text mapping (deterministic mapping from typed state to color/label).
- **Manual smoke test** on device:
  1. Cold launch with BLE off → Strap red, Phone amber, Backend depends on prior queue.
  2. BLE connects → Strap green, Phone amber for ~30s, then green when daemon ticks.
  3. Sync in flight → SyncProgressCard renders.
  4. Force API failure (point app at bad URL) → warn row in Events, Backend chip amber/red.
  5. Long-press header → expert mode unlocks, danger group shown in red.
  6. Logs Copy → clipboard contains the visible tail.
  7. Logs Export → iOS share sheet opens.

## Implementation Notes

### Files to change

- `apps/app/app/screens/DebugInspectorScreen.tsx` — re-orchestrate sections
- `apps/app/app/components/Inspector/HealthStrip.tsx` (new) — 4-chip strip
- `apps/app/app/components/Inspector/EventsCard.tsx` (new) — merged Alerts + Activity
- `apps/app/app/components/Inspector/DaemonDrilldown.tsx` (new) — collapsible stats
- `apps/app/app/components/Inspector/LogsCard.tsx` — add Copy button, swap to icon-only
- `apps/app/app/components/Inspector/ActionsRow.tsx` (new) — 4-in-1 row
- `apps/app/app/components/Inspector/ExpertActions.tsx` (new) — 3 grouped expert sections
- `apps/app/app/components/Inspector/SyncProgressCard.tsx` — keep, ensure conditional render
- **Delete**: `apps/app/app/components/Inspector/LiveMonitorCard.tsx`, `DiagnosticsCard.tsx`, `ActionsCard.tsx` (logic moved into the new components above)

### Phosphor icons used

Each row/chip uses an inline `PhosphorIcon` already wired in the codebase: `Bluetooth`, `DeviceMobile`, `Cloud`, `Warning`, `Pulse`, `Clock`, `List`, `Copy`, `Export`, `ArrowsLeftRight`, `ArrowClockwise`, `Broom`, `Check`, `Database`, `Power`, `Bug`, `Wrench`.

### Selectors

Pure functions in `apps/app/app/components/Inspector/selectors.ts`:

```ts
strapChipState(ble): { dot, sub }
phoneChipState(daemon, ble, errors): { dot, sub }
backendChipState(queue, lastSync, apiFailures): { dot, sub }
coverageChipState(coverage): { color, percent }
```

Each returns a discriminated union over chip states. Snapshot the outputs in unit tests so future state additions are caught.
