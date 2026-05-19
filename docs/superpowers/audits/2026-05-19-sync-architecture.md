# Sync architecture audit: strap → phone → backend

**Date:** 2026-05-19
**Trigger:** Multiple data gaps (5-min and 15-min windows) detected in
backend `raw_sensor_records` despite the durable-ACK design that's
supposed to prevent loss. User flagged concern that the proliferation
of timers, loops, and intervals might be the cause.

## TL;DR

We're running **8 concurrent loops** that share a single `bleManager`
and the strap as a single physical resource. At least two of them
(`maybeAutoSync` and `continuousSyncDaemon`) are redundant. Several
issue `writeCommand` calls concurrently with the syncing data flow.
The system is over-engineered for what it does, and that complexity is
the most plausible explanation for the gaps — more so than firmware
bugs that we've already worked around.

**Recommended action:** Simplify to **one** sync orchestrator + one
HTTP drainer. Kill the redundant interval-driven sync. Audit every
`writeCommand` call site to ensure they're all gated on sync state.

## Map: every loop in the system

| # | Loop | Cadence | Where | What it does | BLE writes? |
|---|---|---|---|---|---|
| 1 | `SyncService.timer` | 15 sec | `app.tsx:164` → `SyncService.ts:18` | Drains outbound queue via HTTP POST | No (HTTP only) |
| 2 | `AppState foreground` | event | `app.tsx:167` | Calls `svc.refresh()` → drain + pull | No |
| 3 | `syncTimer` | 2 min | `BleContext.tsx:1793` | Calls `maybeAutoSync` (internal 15-min throttle) | Yes, via `syncNow` |
| 4 | `batteryPollTimer` | 5 min | `BleContext.tsx:1799` | Polls battery level | **Yes** (cmd write) |
| 5 | `smartWakeTimer` | variable | `BleContext.tsx:827` | Alarm-wake check | **Yes** (potentially) |
| 6 | `packet-drain debounce` | 1.5 sec after BLE packet, only while backgrounded | `BleContext.tsx:1783` | Background drainer | No |
| 7 | `continuousSyncDaemon` | 30 sec | `continuousSyncDaemon.ts` | Calls `syncNow` | **Yes**, via `syncNow` |
| 8 | `syncNow` inner loop | per-tap, while(true) up to 20 passes | `BleContext.tsx:syncNow` | Re-issues `SendHistoricalData` | **Yes** |
| 9 | `HistoryDownloader.idle` | 15 sec mid-stream silence | `history-downloader.ts:8` | Terminal → `persistAndFinish` | No (writes happen at start) |
| 10 | `HistoryDownloader.hard` | 120 sec | `history-downloader.ts:7` | Terminal → `persistAndFinish` or error | No |
| 11 | `HistoryDownloader.cmdResp` | 3 sec after cmd 23 response | `history-downloader.ts:236` | Terminal → `persistAndFinish` | No |
| 12 | `runBackgroundDrain` | ad-hoc, up to maxMs | `androidForegroundService.ts` + bg-packet handler | HTTP drainer iteration | No |

## Concurrency risks

### R1 — Multiple paths drive `syncNow` simultaneously

`syncNow` has a re-entry guard via `isSyncingRef`, so concurrent calls
short-circuit. **But**:

- The order of which caller "wins" is non-deterministic. The user can
  tap Sync while the daemon's tick is mid-execution → the user's tap
  silently no-ops.
- The 2-min `syncTimer` calls `maybeAutoSync`, which calls `syncNow`.
  The 30-sec daemon also calls `syncNow`. They're redundant.
- When both fire near-simultaneously, the first acquires the lock,
  the second's "skipped" event is logged only inside the daemon —
  the `syncTimer` failure is silent.

**Smell.** One orchestrator should own the cadence. Pick one.

### R2 — `writeCommand` is not serialized across callers

`bleManager.writeCommand(...)` is fire-and-forget for the strap. The
following call sites all write concurrently without coordination:

- `batteryPollTimer` (every 5 min)
- `bootstrapStrapModes` (on connect — fires HR, generic profile, raw
  data start back to back)
- `refreshDeviceState` (on connect — fires battery, hello, alarm,
  version, clock back to back)
- `syncNow`'s preflight (`AbortHistoricalTransmits`)
- `HistoryDownloader.startDownload` (`EnterHighFreqSync` + 200ms
  setTimeout + `SendHistoricalData`)
- Every `HistoryEnd` ACK (`HistoricalDataAck(trim)`)
- Various probe/rewind/recovery flows

If the battery poll fires while the downloader is in the middle of an
`EnterHighFreqSync`+`SendHistoricalData` sequence, the strap sees an
unexpected command and may behave unpredictably. We don't currently
serialize writes against the active sync session.

**Smell.** Either (a) serialize via a write queue/mutex, or (b)
guard non-sync writes by checking `isSyncingRef.current`.

### R3 — `syncNow`'s inner loop iterates with no inter-pass delay

The loop in `BleContext.tsx:syncNow` calls `downloader.startDownload`
in a tight `while(true)` for up to 20 passes. The strap is given no
breathing room between sessions. Combined with the new daemon firing
every 30 seconds, the strap may be receiving `SendHistoricalData`
commands roughly continuously while idle.

The whoopsi RE notes describe the strap as accepting one command at a
time with brief gaps. No evidence yet that hammering it causes
firmware regressions, but it's a smell.

**Smell.** At minimum, log the inter-pass timing to ground future
investigation.

### R4 — `lastSyncCleanRef` resets to `true` on every BLE reconnect

`BleContext.tsx:413` sets `lastSyncCleanRef.current = true` on every
successful `bleManager.connect()`. Intent: post-reconnect the strap
state is fresh, no preflight needed.

But what if the *previous* connection died because the strap was
mid-stream? The strap remembers nothing about our app, but its read
pointer may have advanced past records we never persisted.
Reconnecting and skipping the preflight means we never abort the
phantom in-flight stream — the next `SendHistoricalData` starts a
*new* session while the old one's records are still on the strap's
"sent" stack.

**Smell.** The clean/unclean signal is based on app-side state, not
strap-side state. We have no read into the strap's transmit FSM.

### R5 — The daemon doesn't honor backoff after a failure

`continuousSyncDaemon` ticks every 30s regardless of whether the
prior tick succeeded, errored, or hit `caught_up`. If we hit a
transient BLE error, we retry in 30s with no exponential backoff. If
the strap is genuinely caught up, we ping it 120 times per hour to
re-confirm.

**Smell.** Adaptive cadence — fast (30s) when in-progress / making
progress, slow (5min) when recently caught up.

### R6 — `runPipelineInBackground` can stack

Every non-empty `syncNow` fires `runPipelineInBackground`. The
internal guard prevents *concurrent* pipeline runs, but if the daemon
ticks 60 times in an hour and each tick has a few new records, we
fire up to ~12 background pipeline calls (after the throttle gate
applies). That's not a data-integrity issue, but it's load.

**Smell.** Already throttled internally; just noting.

### R7 — `isSyncingRef.current` is the *only* gate; no abort if cancelled

If `syncNow` is mid-execution and the user logs out or BLE
disconnects, there's no signal to gracefully abort the in-flight
download. The `HistoryDownloader` will time out on its own (15s idle,
120s hard), but during that window the strap may have advanced its
cursor.

**Smell.** A `cancellationSignal` plumbed through `syncNow` →
`HistoryDownloader` would let us stop cleanly on disconnect/logout.

## Simplifications

### S1 — Delete `syncTimer` (2-min `maybeAutoSync`)

It's redundant with the 30-sec `continuousSyncDaemon`. The
`maybeAutoSync` function's internal 15-min throttle (it requires
`lastSyncAt` to be >= 15 min old) means it almost never fires anyway
once the daemon is running.

**Change:** Remove the `syncTimer` setInterval and the `maybeAutoSync`
callback. Keep its on-connect call site (which fires once after
connect to seed the first sync).

### S2 — Serialize all `writeCommand` calls

Two options:

**(a) Write queue with FIFO ordering.** All callers
`await bleManager.enqueueWrite(payload)` instead of
`writeCommand`. Underlying queue ensures one outstanding write at a
time. Simple and bulletproof.

**(b) Sync-aware gating.** Non-sync writes (battery, alarm, mode
toggles) check `isSyncingRef.current` and defer or abort. Less
invasive but more places to remember.

Recommend (a). It's a 20-line change in `bleManager`.

### S3 — Make the daemon adaptive

Pseudocode:

```ts
const tick = async () => {
  const startedAt = Date.now()
  await syncNow()
  const session = lastSession()
  if (session.recordsPulled > 0) {
    schedule(30_000)  // active backlog → fast cadence
  } else if (session.stopReason === "caught_up") {
    schedule(5 * 60_000)  // genuinely caught up → slow cadence
  } else {
    schedule(60_000)  // soft errors → moderate retry
  }
}
```

### S4 — Plumb a cancellation signal

`syncNow` takes an `AbortSignal`. On BLE disconnect or logout, the
signal aborts. `HistoryDownloader` listens and cancels its terminal
timers + writes a `buildAbortHistoricalTransmits` cleanup to the
strap.

Caveat: writing cmd 20 mid-stream is the very thing that may cause
the cursor-skip in the first place. So the cancellation path needs to
be **silent** — don't try to clean up the strap, just stop awaiting
its packets and let it eventually time out on its own.

### S5 — Test `lastSyncCleanRef` reset against reconnect

Need real evidence: does the strap's read pointer survive a BLE
disconnect, or does it reset to "next-record-to-send"? Could be that
disconnect is actually clean and we never needed the preflight.

Add instrumentation: log the strap's `GetDataRange` start/end on every
connect, and compare against the last-seen position before disconnect.

## Recommended next steps, in order

1. **Land S1 (delete `syncTimer`)** — pure deletion, can't make things
   worse.
2. **Add the audit's missing observability** — sync-sessions ring,
   gap detector, daemon stats, persistent log. (Tasks 110-113 already
   in the queue.) These let us actually measure the next changes.
3. **Land S2 (write queue)** — biggest expected impact on the
   over-ACK / cursor-skip class of bug.
4. **Verify with the new logs** — if gaps stop, the audit's hypothesis
   was correct.
5. **If gaps persist, land S3 + S4 + S5.**

Steps 1–2 are reversible and low-risk; do them in tomorrow's session.
Step 3 requires careful testing and probably its own brainstorm round.

## Out-of-scope but related

- HTTP drainer (SyncService 15s) is independent of the BLE chain and
  not implicated in the gaps. Leave it alone.
- Pipeline timing (#95 already addressed) is independent.
- Backend ingest endpoint timing (#87 already addressed) is
  independent.
