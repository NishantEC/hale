# Strap trim-ACK behavior — investigation (task #89)

## Question

Why does the strap deliver flash records from earlier than the previously-ACKed
position after a fresh app install? We send `HistoricalDataAck(trimValue)`
after every batch; if the strap honored it, the next session should resume from
`last_trim + 1`. Instead we see the strap restart from somewhere near the
bottom of its ~5-day ring buffer.

## What the code does today

| Frame | File:line | Framing | Response observed? |
|---|---|---|---|
| `HistoricalDataAck` (cmd 23) | `command-service.ts:58` | legacy (0xAA + length + crc8 + crc32) | **fire-and-forget** (`.catch(()=>{})`) |
| `SendHistoricalData` (cmd 22) | `command-service.ts:54` | legacy | optional `CommandResponse` → 3s cooldown |
| `AbortHistoricalTransmits` (cmd 20) | `command-service.ts:132`, called at `BleContext.tsx:403` (preflight) | legacy | fire-and-forget |
| `ExitHighFreqSync` (cmd 97) | `command-service.ts:295` | legacy | fire-and-forget |
| `SetReadPointer` (cmd 33) — 3 probe shapes | `command-service.ts:157` | legacy | observed via Inspector probes; all three NOP |
| `SetReadPointerSectorOffset` | `command-service.ts:282` | **Maverick** (CRC-16/MODBUS header + CRC-32 payload) | observed; **works** (per whoopsi) |
| `FORCE_TRIM` (cmd 25) | `command-service.ts:181`+ | **Maverick** | observed; works in `whoopsiInitThenForceTrim` flow |

`HistoryEnd` packet's trim value is parsed at `history-downloader.ts:191-195`,
primary offset = bytes 10-13 LE u32, fallback = bytes 1-4 (legacy variant).

## Hypothesis ladder (most → least likely)

### H1 — Legacy-framed `HistoricalDataAck` is silently ignored on Gen4 firmware

Strongest evidence: the only commands we know work for cursor manipulation
(`FORCE_TRIM`, `SetReadPointerSectorOffset`) use **Maverick framing**. Cross-
references in `command-service.ts:223` already note "FORCE_TRIM in our legacy
framing is silently rejected by Gen4 firmware." It would be consistent for
`HistoricalDataAck`'s in-band trim to suffer the same fate — the strap
streams data correctly (cmd 22 works in legacy), but the *cursor advance*
portion of the ACK requires Maverick framing.

How to confirm: send the ACK and **observe the strap's `CommandResponse`**
(we currently `.catch(()=>{})` it). Cross-reference against whoopsi/openwhoop
which DO observe responses. If we see a rejection code, this is the answer.

### H2 — `HistoricalDataAck` works in-session but doesn't persist across reconnect

Strap firmware stores the cursor in RAM only. On reconnect (especially after a
fresh-install pairing handshake that the strap interprets as a new session),
the cursor resets to "oldest unsent in flash." Per-batch ACKs within one
session trim the in-RAM cursor; reconnect zeros it.

How to confirm: capture two back-to-back syncs without disconnecting between
them. If batch 2 starts at `batch_1_last + 1`, H2 is right. If it restarts at
the bottom, H1 is right.

### H3 — `AbortHistoricalTransmits` (cmd 20) is itself resetting the cursor

The preflight at `BleContext.tsx:403` was added "to clear half-finished
transmit state" — the comment claims it doesn't touch the trim, but that's
an assumption. If cmd 20 actually rewinds, every sync starts from "bottom of
the flash buffer" by design.

How to confirm: comment out the preflight, run one cycle, see if delivery
resumes from a later point than before.

## Recommended next steps (not done in this pass)

1. **Observe CommandResponse for `HistoricalDataAck`** — wire a listener in
   `history-downloader.ts` that reads the strap's response and logs accept/
   reject. Cheap, additive, no protocol changes. Resolves H1 directly.

2. **A/B test with preflight disabled** — gated behind an Inspector switch so
   you can run a sync with cmd 20 disabled. Resolves H3.

3. **If H1/H2/H3 don't crack it**: derive sector+offset for the strap-time
   *just past* the backend high-water and issue `SetReadPointerSectorOffset`
   in Maverick framing at session start. This is the "skip the backlog"
   move — uses a proven command. Risk: we don't have a public formula for
   `(timestamp → sector, offset)`; would need empirical probing.

## 2026-05-23 update — H1 resolved empirically

Verified via the b1d0d2b2 → 361648f2 A/B (correlation-fixed ack telemetry
+ framing toggle):

- **Maverick framing is wrong for cmd 23.** Switching to Maverick (e15d2208)
  broke cursor advancement and produced the stuck-at-same-trim looping seen
  in 2026-05-21/22 logs. The May 20 22:02 status=1 evidence that motivated
  e15d2208 was a transient — not a steady-state framing problem.
- **Legacy framing works** even though the strap never sends a
  CommandResponse for cmd 23. The strap silently processes legacy-framed
  acks and advances its read pointer. Verified by trim 116418→116464 across
  7 caught_up sessions in 3.5 min (2026-05-23T00:05:33Z onward).
- H1 was therefore half-right: legacy framing was being silently dropped
  *some of the time* on May 20, but it's the only framing the strap accepts
  for cmd 23 — and most of the time it works fine. Switching framings
  doesn't fix the transient drops; the empty-CommandResponse telemetry
  (post-b1d0d2b2 correlation) is misleading because the strap never
  responds to cmd 23 even when it processes the ack.

H2 (cursor in RAM, resets on reconnect) and H3 (cmd 20 rewind risk) are
still untested and remain open.

## What does NOT need investigating

- `FORCE_TRIM(0,0)` is **not** a generic "advance to position X" — per
  whoopsi notes ("only exposes the wrap-around segment"), it's a special-
  case probe for accessing data the normal flow doesn't surface. Not a
  cursor-skip primitive.
- The 3 legacy `SetReadPointer` probe shapes are dead-ends per the user's
  own commit `ca6e726c`. Cross-confirmed against 3 reverse-eng projects.

## Open question for the user

Investigation 1 (observe `HistoricalDataAck` response) is the cheapest move
and would resolve the ambiguity. Should I spike that as a code task before we
chase any of the harder paths?
