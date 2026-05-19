# Activity Detector — Backend Redesign

## Problem

`apps/backend/src/processing/activity-detector.ts` produces structurally wrong bouts: e.g., a single 262-minute "General Exercise" entry that spans an entire afternoon of mixed sedentary + light activity.

Three concrete defects (see `activity-detector.ts` for line refs):

1. **Edge-triggered per-sample motion threshold** (`segmentIntoBouts` L251). A single gravity-delta sample > 0.01g opens a bout. Wrist twitches, typing, hand-talking all open bouts.
2. **5-minute merge-gap** (`MERGE_GAP_MINUTES`, L52). Any two bouts within 5 min are glued, so a sedentary afternoon with intermittent fidget collapses into one blob.
3. **`'General Exercise'` is a confidence-laundering fallback** (L378): `else if (hrZone >= 2) activityType = 'General Exercise'`. Mild HR elevation from being upright lands here when no cadence locks.

Aliased FFT compounds it. Cadence bands assume ≥7.4 Hz Nyquist (`CADENCE_RUNNING_HIGH = 3.7`), but historical sensor records are **1 Hz** (`apps/app/app/services/ble/packet-types.ts:149`; `resource/openWhoop-2/RESEARCH.md` L104). `detectCadence` (L422) is aliased noise; it never locks Walking/Running/Cycling, so everything falls past those branches into the General Exercise bucket.

## Decision

Precision-first heuristic rewrite, features factored cleanly so a feature-based GBDT swap is a later, additive step. Concretely:

- Replace edge-triggered segmentation with **window-fraction stillness** (port from `resource/openwhoop/src/openwhoop-algos/src/activity.rs:53-142`).
- Replace the merge-gap mechanic with **`filter_merge`-style short-run absorption** (port from same source, L144-194).
- **Two-tier output**: named workouts (high-confidence, promoted bouts) and `Candidate` bouts (low-confidence, user-confirmable) — leveraging the existing `userConfirmedType` / `dismissedAt` columns from migration `1779700000000-ActivityConfirmation`.
- **Delete `'General Exercise'`** from the taxonomy. Failures fall to `Light Activity` (named, honest) or to `Candidate` (acknowledged uncertainty).
- **Delete `detectCadence` FFT.** At 1 Hz it can't resolve walking/running cadence bands. Sub-classifying Walking vs Running uses HR + tilt-stats + duration, not cadence.
- **HRR/Karvonen** zones replacing `%HRmax`. `HRmax = 192 − 0.007·age²` (Gellish nonlinear) corrected by observed-max if we have one.
- **Day strain** is its own log-sum across all elevated-HR minutes — not Σ bout-strains.
- **Bout-level evaluation harness** (precision, recall, false-bout-hours/day, median boundary error, catastrophic-merge rate) with journal entries as weak labels.

Frontend revamp is out of scope and tracked separately.

## Pipeline

```
raw 1Hz records
   ↓
filter sleep + off-wrist  (hard veto)
   ↓
per-sample features: |Δgravity|, gravity-tilt stats, HR, %HRR
   ↓
window-fraction stillness  (centered 15-min rolling)
   ↓
is_active stream  (binary: still_frac < 0.70)
   ↓
candidate segmentation  (run-length encoding with 20-min gap-break)
   ↓
filter_merge  (absorb short runs into neighbours)
   ↓
admission gate  (Candidate: HRR≥25% sustained ≥3min AND is_active)
   ↓
promotion gate  (Named: ≥15 min AND bout-strain ≥6 AND classifier confidence ≥0.6)
   ↓
classify  (10-class taxonomy, Rich-10)
   ↓
per-bout TRIMP + log-mapped strain
   ↓
emit ActivityBout[]  (source='detected' for Named, source='candidate' for Candidate)
   ↓
separate day-strain log-sum  (over all elevated-HR minutes — independent of bouts)
```

## Segmentation algorithm (the 262-min fix)

Port from `resource/openwhoop/src/openwhoop-algos/src/activity.rs:53-142`:

1. Compute per-sample `|Δgravity| = ||g_t − g_{t-1}||`.
2. Estimate sample interval from **median** of inter-sample diffs (NOT mean — robust to gaps). Source: `activity.rs:74-81`.
3. Per sample, `is_still[i] = (|Δgravity[i]| < 0.01)`.
4. Centered 15-minute rolling window. For each sample `i`, `still_frac[i] = mean(is_still[i-W/2 : i+W/2])` where `W = 15min / sample_interval`.
5. Per sample, `is_active[i] = (still_frac[i] < 0.70)`.
6. Run-length encode: each maximal `is_active` run is a candidate bout. **Force a boundary** on any data gap > 20 min (off-wrist, BLE outage).
7. `filter_merge`: any run shorter than 15 min gets absorbed into the dominant neighbour. If both neighbours match, bridge across (port symmetrically from `activity.rs:144-194`).

**Why this kills the 262-min bug**: a wrist twitch produces ~1 active sample. With a 15-min centered window at 1 Hz that's 1/900 ≈ 0.001 fraction — far from triggering `still_frac < 0.70`. The bout only opens when ≥30% of a centered 15-min window is actively moving. A sedentary afternoon with intermittent fidget no longer admits.

## Bout admission gates

### Candidate tier entry

All of:

- `is_active === true` (from segmentation above)
- `%HRR ≥ 25%` sustained for ≥3 min within the candidate run.
  - `%HRR = (HR − RHR) / (HRmax − RHR)` (Karvonen).
- No sleep-window overlap.
- No off-wrist-interval overlap.
- Run duration ≥ 3 min (post-filter_merge).

If gates pass and promotion fails → emit with `source = 'candidate'`, `confidence < 0.6`, `activityType = 'Candidate'`.

### Promotion to named workout

All of:

- Bout duration ≥ **15 min**.
- Bout strain ≥ **6** (log-mapped TRIMP; see Strain math).
- Classifier picks a specific class with `confidence ≥ 0.6`.

If all pass → emit with `source = 'detected'`, `activityType = <one of Rich-10>`.

### Bout exit

Active bout terminates when, for ≥3 continuous minutes:

- `is_active === false` (window-fraction stillness ≥ 0.70), **AND**
- `%HRR < 15%`.

Both required — prevents premature exit during recovery jogs and rest intervals between sets.

## Classification rules (Rich-10)

Each rule below is the **necessary class predicate**. Classifier picks the highest-priority matching class; ties broken by higher confidence score. **"Sustained"** in the predicates below means **≥ 50% of bout duration meets the threshold** unless otherwise qualified.

| # | Class | Predicate (post-admission) | Confidence basis |
|---|---|---|---|
| 1 | **Stair Climb** | Existing `stair-detector.ts` signature fires within bout window | Detector's own score |
| 2 | **Running** | `%HRR ≥ 70%` sustained ≥ 50% of bout AND `tilt_variance ≥ TBD_R` AND duration ≥ 10 min | Sustained-zone fraction |
| 3 | **HIIT** | HR shows ≥ 4 intervals of `(spike to ≥75% HRR) → (recovery to <50% HRR)` within bout, each 1–5 min | Interval count + alternation regularity |
| 4 | **Cycling** | `%HRR ≥ 40%` sustained AND `tilt_variance` low (wrist relatively still on bars) AND duration ≥ 15 min | Low-tilt + sustained-HR fit |
| 5 | **Strength** | `%HRR ≥ 40%` AND high `tilt_variance` AND **episodic** motion pattern (alternating high/low motion minutes — sets + rests) | Set/rest cadence detection |
| 6 | **Hiking** | Existing `hiking-detector.ts` signature OR (Walking gates AND duration ≥ 45 min AND barometer elevation gain ≥ 100m if present) | Detector score |
| 7 | **Walking** | `25% ≤ %HRR < 60%` sustained AND moderate `tilt_variance` AND duration ≥ 5 min | HR fit + tilt fit |
| 8 | **Cardio** | `%HRR ≥ 50%` sustained AND no other named class fits | Sustained HR alone |
| 9 | **Mixed** | Bout duration ≥ 20 min AND avg `%HRR ≥ 50%` AND no class fits with confidence ≥ 0.6 | Honest "high-effort, ambiguous shape" — **NOT a fallback for any admission** |
| 10 | **Light Activity** | Admission passed but failed every named-class predicate | Default named class |

`Candidate` is not in the list — it's a tier above the taxonomy. Emitted for bouts that pass motion gate but fail promotion gates.

**`Mixed` discipline**: explicitly NOT a fallback for "anything admitted." Only fires when bout has unambiguous workout signal (sustained high HR, long duration) but ambiguous shape. The threshold of `confidence ≥ 0.6` on classes #2-#8 prevents Mixed from absorbing low-confidence specific classes.

`TBD_R`: tilt-variance threshold for Running. Calibrate against journal-labeled bouts; placeholder `0.05` (gravity-normalized).

## Strain math

Per-bout TRIMP (Edwards zone-weighted):

```
TRIMP = Σ (minutes_in_zone_i × weight_i)
weight = [0, 1, 2, 3, 4, 5]  // zones 0..5 by %HRR thresholds
zones %HRR thresholds = [0, 25, 50, 60, 70, 80, 100]  // 6 buckets
```

Log-mapped to 0–21 (Borg-RPE doubled, per `research/whoop-features-deep-dive.md` §2.9):

```
strain_0_21 = 21 × ln(TRIMP + 1) / ln(7201)
```

Day strain is **independent**: same formula over `(zone-minutes summed across the whole day, including non-bout time)`. Not `Σ bout_strain`.

## HR-zone math

Switch from current `%HRmax` to HRR/Karvonen:

```
%HRR = (HR − RHR) / (HRmax − RHR)
HRmax = max(192 − 0.007·age², observed_max_last_90d)
RHR   = baseline.restingHeartRate
```

Zones by `%HRR`: `[<25, 25–50, 50–60, 60–70, 70–80, ≥80]`.

If `age` is unknown, fall back to `220 − age` ≈ default `190` (and accept lower precision). If `RHR` is unknown, fall back to `60`. Both fall-backs reduce confidence in any bout that depends on the gates.

## File / module structure

Rewrite is contained in `apps/backend/src/processing/`. Existing files audited:

| Path | Action |
|---|---|
| `activity-detector.ts` (509 L) | **Replace.** New entry point, smaller — orchestrates the modules below. |
| `activity-detector.spec.ts` | **Rewrite.** Coverage maps to new module boundaries. |
| `hiking-detector.ts` | **Keep.** Called by classifier rule #6. |
| `stair-detector.ts` | **Keep.** Called by classifier rule #1. |
| `healthkit-workout-matcher.ts` | **Keep.** Post-detection reconciliation step unchanged. |
| `interfaces.ts` | Extend `ActivityType` enum to Rich-10 + `Candidate`. Delete `'General Exercise'`. |

New modules (factored for the GBDT swap path):

| Path | Role |
|---|---|
| `processing/activity/features.ts` | Pure functions over `HistoricalSensorRecord[]` → per-sample features (`|Δgravity|`, `tilt_variance`, `is_still`, `still_frac`, `%HRR`, zone). Median sample-interval estimator lives here. |
| `processing/activity/segmentation.ts` | Window-fraction stillness → run-length encoding → `filter_merge`. Pure. |
| `processing/activity/gates.ts` | Candidate-entry and promotion gates as pure predicates over a segment + feature stream. |
| `processing/activity/classifier.ts` | Rich-10 rule cascade. Each rule a named function returning `{class, confidence}`. |
| `processing/activity/strain.ts` | TRIMP + log-mapping (per-bout AND day). |
| `processing/activity/index.ts` | New `detectActivities(records, sleepDetections, offWristIntervals, baseline) → ActivityBout[]` orchestrator. |
| `processing/activity/eval/` | Bout-level evaluation harness (see below). Out-of-line from main pipeline; called by spec tests and the CLI dev tool. |

## Evaluation harness

Codex's recommendation, baked in from v1:

- **Inputs**: a day's `ActivityBout[]` output + same day's journal entries.
- **Weak labels**: journal entries with a non-Rest activity tag become `(start, end, class)` tuples. We accept that the start/end times are noisy.
- **Metrics**:
  - **Bout-level precision** = (#detected bouts that overlap ≥50% with a journal bout of compatible class) / (#detected bouts).
  - **Bout-level recall** = (#journal bouts covered ≥50% by a detected bout of compatible class) / (#journal bouts).
  - **False bout-hours/day** = total detected non-`Light Activity` time not covered by any journal bout.
  - **Median boundary error** = median |detected_start − journal_start| over matched pairs.
  - **Catastrophic merge rate** = fraction of detected bouts whose duration > 2× the longest overlapping journal bout.
- **CLI**: `processing/activity/eval/run.ts` accepts `--user --from --to` and emits a JSON report.
- **Test fixtures**: 5-10 representative anonymized day-snapshots checked in under `apps/backend/test/fixtures/activity-days/`. The .spec.ts asserts the metric thresholds over the fixtures.

Acceptance bar for the rewrite: on the fixture set, **precision ≥ 0.85, false bout-hours/day ≤ 1.0, catastrophic-merge rate = 0**. Recall can be lower (precision-first stance); we cover the recall gap via the `Candidate` tier.

## What we delete

| Deletion | Reason |
|---|---|
| `'General Exercise'` from `ActivityType` (interfaces.ts L23) and the fallback branch (L378) | Confidence-laundering catch-all; root cause of the 262-min blob |
| `detectCadence` FFT (L422) and `CADENCE_*` constants (L64-69) | Aliased at 1 Hz — produces noise, never locks |
| `segmentIntoBouts` (L251) — single-pass edge-triggered | Replaced by window-fraction stillness |
| `mergeBouts` (L292) and `MERGE_GAP_MINUTES` (L52) | Replaced by `filter_merge` |
| `MIN_BOUT_MINUTES = 3` drop (L51, L103) | Replaced by short-run absorption (lossless) |

## What we keep

- HealthKit workout matching (`healthkit-workout-matcher.ts`)
- Stair detector (`stair-detector.ts`) — signature is robust at 1 Hz
- Hiking detector (`hiking-detector.ts`)
- Gap-entry emission (`detectGapEntries` L119) — produces Off-Wrist / No Data feed entries
- Off-wrist interval consumption (`OffWristIntervalLite`)
- Per-bout strain computation **shape** (compute per bout, but switch math to log-mapped TRIMP)
- `ActivityBout` interface (extend with `confidence` semantics + `source='candidate'` path; do not change existing field names)

## Data model

No new columns required. The existing migration `1779700000000-ActivityConfirmation` already added `userConfirmedType` and `dismissedAt`, and `source` (default `'detected'`) supports the `'candidate'` value.

We will document the convention in code:

- `source='detected'` — promoted, named bout. Shown as confirmed activity.
- `source='candidate'` — admission passed, promotion failed. Shown as "Possible activity — confirm?" in the feed.
- `source='healthkit'` — imported from HealthKit (unchanged).
- `source='manual'` — user-entered (unchanged).
- `userConfirmedType` set → user confirmed and (optionally) renamed.
- `dismissedAt` set → user dismissed; pipeline must not re-emit for the same window.

The pipeline will read `dismissedAt` and `userConfirmedType` from prior runs and respect them on re-compute.

## Out of scope

- Frontend revamp of the activity feed UI — separate later effort per user.
- 52 Hz IMU capture during detected bouts — strategically right but big plumbing work; defer.
- Feature-based GBDT/ML classifier — feature pipeline is factored so this is additive later; not v1.
- Real cadence FFT — requires above-1Hz sampling; needs (3) first.
- Auto-classification of recovery activities (cold plunge, sauna, yoga nidra) — WHOOP doesn't auto-classify these either; manual log path stays.
- Pace / distance estimation — requires GPS or high-frequency IMU; out of scope without one.
- Strength Trainer rep counting — requires 26+ Hz IMU; manual-only for v1.

## Testing

- **Unit**: `features.test.ts`, `segmentation.test.ts`, `gates.test.ts`, `classifier.test.ts`, `strain.test.ts` — each module pure and unit-tested in isolation.
- **Integration**: `activity-detector.spec.ts` rewritten to cover the orchestrator end-to-end on synthetic record streams.
- **Acceptance**: evaluation harness must pass the precision / false-bout-hours / catastrophic-merge thresholds above on the fixture set.
- **Regression**: at least one fixture must reproduce the 262-min "General Exercise" failure on the OLD code and produce a clean named-bout-or-Candidate set on the NEW code. This is the golden regression test for the rewrite.
