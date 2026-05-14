# Inspector Tab — Redesign Spec

**Date:** 2026-05-14
**Status:** Approved, pending implementation plan

## Goal

Promote the existing `DebugInspectorScreen` (today reachable only via Settings → Diagnostics, titled "Sync Inspector") to a first-class bottom tab in the mobile app, with a redesigned layout that surfaces live system health, last-night diagnostics, and recovery actions in one screen.

## Scope

In scope:

- Add a 4th tab "Inspector" to `MainNavigator`, always visible (no dev/prod gating).
- Move `DebugInspectorScreen` content under that tab and replace its current layout with three collapsible cards.
- Remove the Settings → Diagnostics link (the tab makes it redundant) — touches `DeviceSettingsScreen.tsx`.
- Move `Log Out` out of Inspector — it isn't a diagnostic action. Surface stays in `DeviceSettingsScreen` where account controls live.
- Keep all other capabilities (sync, force-upload, run-pipeline, queue clear, reboot, power-cycle, etc.) — this is a layout/UX change, not a feature reduction.

Out of scope (separate work):

- Fixing the realtime BLE stream that's been dead since 2026-05-11 (surfaced *by* this redesign, fixed elsewhere).
- Reducing pipeline `compute` stage from 180 s.
- Mirroring the web inspector's 7 tabs on mobile.

## Architecture

### Navigation change

`MainNavigator.tsx` gains one `Tab.Screen` between `Device` and the existing nested screens:

```
Home · Trends · Device · Inspector
```

`AppNavigator.tsx` keeps the existing `DebugInspector` stack screen as the implementation; the tab simply mounts the same `DebugInspectorScreen` component. Settings → Diagnostics link is removed (the tab makes it redundant).

### Screen structure

`DebugInspectorScreen` becomes a single `ScrollView` holding three `<InspectorCard>` components in fixed order, top to bottom:

1. **Live Monitor**
2. **Diagnostics**
3. **Actions**

Each card is a controlled collapsible. The card component takes `{ title, statusPill, defaultExpanded, children }` and owns its own expanded/collapsed local state. There is no global expand-all/collapse-all control.

### Smart-default expand rules

Computed on screen mount (and re-evaluated on `refreshInspector`):

- **Live Monitor** — expand if any of: last raw record &gt; 1 h ago · BLE not `ready` · queue dead-letter count &gt; 0 · battery &lt; 15% · realtime stream stale &gt; 1 h (no `signal_samples` ingestion event in the window).
- **Diagnostics** — expand if any of last 3 calendar nights has no `sleep_detection` · today's data coverage (records seen / expected at typical rate) &lt; 80% · last pipeline run errored.
- **Actions** — always collapsed by default.

If none of these triggers fire, all cards open collapsed and the user is in a quiet "everything is fine" state.

## Card contents

### Live Monitor

Status pill on the header reflects worst-of: `OK` (green) · `Stale Xh` / `Low battery` (amber) · `BLE down` / `Stream dead` (red).

Six rows when expanded, in this order:

| Row | Source | Notes |
|---|---|---|
| BLE | `connectionState` + `isWorn` from `BleContext` | "Connected · on wrist" / "Connected · off wrist" / "Disconnected" |
| Battery | `batteryLevel` + `isCharging` | "24% · charging" / "24% · not charging" |
| Last record | `overview.latestRawTimestamp` from `/debug/overview` | "12h ago" — color amber if &gt; 1 h, red if &gt; 6 h |
| Live HR | `realtimeHeartRate` + last `signal_samples` ingestion | "72 bpm" / "—" / "— (stream dead 3d)" if dead |
| Queue | local outbound queue inspector | "0 pending · 0 dead" — red if dead &gt; 0 |
| Pipeline | `pipeline_state.lastRunAt` + `lastRunDurationMs` | "6h ago · 180s" — amber if duration &gt; 60 s |

### Diagnostics

Status pill reflects: `OK` / `1 issue` / `N issues` (red when nights missed in last 3).

Three sub-sections when expanded:

1. **Last 3 nights** — three rows: `[Day MM/DD] [duration h | "no detection · Xm data"]`. Source: `sleep_detections` table joined with `raw_sensor_records` count per night window. Misses are red.
2. **Today's coverage** — horizontal coverage bar (good/warn/bad segments) + a single line: `[N records] [~Xm of 24 hrs]`. Coverage = `(distinct minutes-of-day with ≥1 raw record) / 1440`. Bar segments: green ≥80%, amber 30-80%, red &lt;30%.
3. **Last pipeline run** — two rows: started timestamp + computed counts (`N detections · N stages`); stage breakdown highlight (`compute Xs of total Ys`). Red if `errored`, amber if `compute &gt; 60 s`.

### Actions

Always collapsed by default. When expanded: two button-grids with sub-section labels.

**Data**:
- Sync from Strap
- Force Upload
- Run Pipeline
- Refresh View

**Recovery**:
- Reboot Strap (destructive style, confirm dialog)
- Power-cycle Strap (destructive style, confirm dialog)
- Clear Queue
- Open Web Inspector

`Log Out` moves out of this card to a separate Settings entry (it isn't a diagnostic action).

## Visual treatment

Locked design: **minimal cards with status pills** (Option A from the mockup session).

- Card background `#18181b` on app background.
- Header: title (14 px, weight 600) left, pill + chevron right.
- Body: tight key→value rows separated by 1px dividers, `font-variant-numeric: tabular-nums` for values.
- Value color: `text` (default) / `statusAmber` / `statusRed` / `statusGreen` — pulled from existing palette.
- Buttons in Actions: 2-column grid, 6 px gap, destructive variants use red-tinted background.

Spacing and palette must reuse `app/theme` tokens (`colors.cardBackground`, `colors.divider`, `colors.statusAmber`, etc.) — no new color values.

## Data dependencies

The screen already consumes `useBle()`, `useDashboard()`, and the existing `/debug/overview`, `/debug/raw-records`, `/debug/sleep-night`, `/debug/pipeline-state`, `/debug/pipeline-runs` endpoints. New data needs:

- **Today's coverage bar** — needs per-hour record counts for today. Either compute client-side from `raw-records` (already returns rows) or add `coverageMinutes` to `/debug/overview`. Prefer client-side for simplicity unless `raw-records` rows are truncated.
- **Realtime stream staleness** — needs `latestSignalSampleAt` per user. Not in `/debug/overview` yet; add it (1-line query, no new endpoint).
- **Last 3 nights summary** — `/debug/overview` already exposes counts for the *selected* day. Add a `recentNights` array `[{nightDate, detectionId | null, rawRecordCount}]` covering 3 nights.

All three additions live in `/debug/overview` to avoid extra network calls when the tab opens.

## Error handling

- BLE errors → already shown in error banner; keep.
- Network errors fetching `/debug/overview` → existing error banner + retry on next `refreshInspector`.
- Action button failures → catch, set `banner` with error string (same as today's `handleRunPipeline`).
- Reboot / power-cycle confirms via `Alert.alert` (already shipped).

## Testing

- Manual: open Inspector tab in each of these states and confirm correct expand defaults + pill colors:
  - Strap connected, fresh data, recent classification → all collapsed, pills green.
  - Strap connected, no data for 12 h → Live Monitor expanded, amber pill "Stale 12h".
  - Last 2 nights missed → Diagnostics expanded, red pill "2 nights missed".
  - Pipeline errored last run → Diagnostics expanded with red value on the pipeline row.
- Visual regression check: card spacing, color tokens, button layout match the approved mockup.
- No automated tests required for this layout-only change; underlying queries/actions already have coverage.

## Open questions

None. Design is complete pending review.

## Risks

- **Tab bar crowding.** 4 tabs vs 3 — bottom-bar real-estate is fine on standard iPhone but worth a visual check on small devices.
- **Smart-default could feel inconsistent** if the user opens the tab during a transient state. Mitigated by the rules using stable thresholds (1 h, 6 h, 80%), not point-in-time blips.
- **Realtime-stream dead detection** depends on adding `latestSignalSampleAt` to the overview endpoint; if that change slips, the Live HR row degrades gracefully to "—" without "stream dead" annotation.
