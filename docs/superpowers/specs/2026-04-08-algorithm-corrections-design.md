# Algorithm Corrections Spec — Expert Review Findings

Date: 2026-04-08

## Background

Three expert reviewers (AI/ML engineer, health data analyst, reference code expert) audited all processing algorithms against the openWhoop Python/Rust reference implementations and published wearable health literature. This spec captures every validated finding and the corrective action for each.

---

## 1. Motion Threshold Mismatch

**Finding:** Our activity detection uses `MOTION_THRESHOLD = 0.015g`. Both reference implementations (Python `activity.py`, Rust `activity.rs`) use `0.01g`. Our threshold is 50% higher, making us less sensitive to small movements.

**Impact:** Under-detects light activity (gentle walking, fidgeting). Over-classifies as "still" during marginal motion.

**Fix:** Change `MOTION_THRESHOLD` from `0.015` to `0.01` in `activity-detector.ts`. Also change `GRAVITY_STILL_THRESHOLD` in `epoch-features.ts` from `0.01` to match (already correct there).

**Files:** `backend/src/processing/activity-detector.ts` line 39

---

## 2. Missing Gravity Data Handling Inverted

**Finding:** When gravity data is null/missing, our code produces `delta = 0` (treated as "still"). The Rust reference (`activity.rs`) produces `delta = MAX` (treated as "active"). This is a safety-critical difference.

**Impact:** Data gaps during device removal or sensor failure are hidden as "sleep" instead of flagged as unknown/active. Could create phantom sleep periods.

**Fix:** In `activity-detector.ts` `computeGravityDeltas()`, when gravity is null, push a large sentinel value (e.g., `1.0`) instead of `0`. Same fix in `epoch-features.ts` `computeGravityDeltas()` and `sleep-event-engine.ts`.

**Files:**
- `backend/src/processing/activity-detector.ts` `computeGravityDeltas()`
- `backend/src/processing/epoch-features.ts` `computeGravityDeltas()`
- `backend/src/processing/sleep-event-engine.ts` (gravity delta function)

---

## 3. Strain Minimum Samples Too Low

**Finding:** Our strain computation accepts as few as 10 HR samples. The Python reference (`strain.py`) requires minimum 600 samples (~10 minutes at 1 Hz). With 10 samples, TRIMP is statistically meaningless.

**Impact:** Produces strain scores from <10 seconds of data. Misleading activity strain values.

**Fix:** Change minimum samples from `10` to `600` in both the daily strain computation (`derived-metrics.ts`) and the per-bout strain (`activity-detector.ts`). For per-bout: if bout has < 600 samples, set strain to 0 (insufficient data).

**Files:**
- `backend/src/processing/derived-metrics.ts` (strainScore function)
- `backend/src/processing/activity-detector.ts` `computeBoutStrain()`

---

## 4. Max HR Hardcoded

**Finding:** Our code uses `maxHR = 190` everywhere. The Python reference uses `200` (configurable). Neither is correct for all users. The Karvonen formula (`220 - age`) or measured max from historical peaks is standard.

**Impact:** A 50-year-old (true maxHR ~170) will never reach zone 4 in our system. A 20-year-old (true maxHR ~200) is under-classified.

**Fix:**
- Add `maxHeartRate` field to `BaselineProfile` interface and entity (nullable, double precision)
- During pipeline, compute `maxHR = max(baseline.maxHeartRate ?? 0, max HR observed in last 45 days, 190)` — use the highest of stored, observed, or default
- Pass this to all strain/zone computations instead of hardcoded 190
- Update `activity-detector.ts`, `derived-metrics.ts`, `wellness-scoring.ts`

**Files:**
- `backend/src/processing/interfaces.ts` — add `maxHeartRate` to `BaselineProfile`
- `backend/src/plans/baseline-profile.entity.ts` — add column
- `backend/src/processing/wellness-scoring.ts` `recomputeBaselineProfile()` — compute max HR from data
- `backend/src/pipeline/pipeline.service.ts` — pass maxHR through
- `backend/src/processing/activity-detector.ts` — accept maxHR parameter
- `backend/src/processing/derived-metrics.ts` — accept maxHR parameter

---

## 5. FFT-Based Cadence Detection

**Finding:** Our cadence detection uses zero-crossing counting, which is noise-sensitive, can't distinguish harmonics, and has a mathematical error (assumes 2 crossings per cycle, but real gravity has 2.5-3). Published wearable literature consistently uses FFT (Welch PSD) for cadence.

**Impact:** Misclassifies activity types ~30% of the time. Running at low cadence misidentified as walking. Cycling confused with walking.

**Fix:** Replace `detectCadence()` in `activity-detector.ts` with FFT-based spectral peak detection. Reuse `fftRadix2()` and `makeHannWindow()` from `hrv-frequency.ts`. Resample gravity magnitude to uniform 4 Hz, compute Welch PSD, find peak in 1.2-4.0 Hz range. Require peak power > 2x noise floor.

**Files:**
- `backend/src/processing/activity-detector.ts` — rewrite `detectCadence()`
- `backend/src/processing/hrv-frequency.ts` — export `fftRadix2` and `makeHannWindow` (currently module-private)

---

## 6. Impact Threshold Normalization

**Finding:** Impact thresholds (0.3g running, 0.15g walking, 0.1g cycling) are absolute values with no basis in research. They're sensor-dependent, body-dependent, and surface-dependent.

**Impact:** False classification when sensor calibration differs, user body type varies, or running surface changes.

**Fix:** Replace absolute impact thresholds with normalized impact-to-motion ratios:
- `impactRatio = peakToTrough / motionIntensity`
- Running: impactRatio > 3.0 (high impact relative to overall motion)
- Walking: impactRatio > 1.5
- Cycling: impactRatio < 1.0

Remove the hardcoded `IMPACT_RUNNING`, `IMPACT_WALKING`, `IMPACT_CYCLING_MAX` constants.

**Files:** `backend/src/processing/activity-detector.ts` — `computeImpactScore()` and `classifyBout()`

---

## 7. HRV Rolling Window

**Finding:** The Python reference implements `rolling_rmssd()` with a 300-interval sliding window (~5 minutes). We compute RMSSD only per 30-second epoch (very few intervals) or as a nightly aggregate. No continuous HRV tracking.

**Impact:** Lose granular HRV dynamics. Can't detect short-term parasympathetic recovery or stress spikes.

**Fix:** Add `computeRollingRMSSD(ibis: number[], windowSize: number = 300, stepSize: number = 30)` to a shared utility. Returns `TimestampedValue[]`. Call from `derived-metrics.ts` to produce an HRV time series alongside stress/SpO2 series.

**Files:**
- `backend/src/processing/derived-metrics.ts` — add rolling RMSSD computation, add `hrvRmssdSeries` to `DerivedMetricsBundle`
- `backend/src/processing/interfaces.ts` — add `hrvRmssdSeries` field

---

## 8. Additional Corrections (from health analyst)

### 8a. SpO2 ODI should filter to sleep windows only

**Finding:** Current ODI divides dip count by total hours including awake time. Clinical AHI is events per sleep hour.

**Fix:** In `spo2-events.ts`, accept optional sleep window parameters. When provided, only count events during sleep and divide by sleep hours.

### 8b. Strain computation should use actual sample timestamps

**Finding:** `computeBoutStrain()` assumes 1-second intervals (`sampleDurationMin = 1/60`). Real samples may be spaced differently.

**Fix:** Pass timestamps alongside heart rates, compute actual inter-sample duration.

### 8c. Sleep buffer for activity detection

**Finding:** No guard band around sleep windows. Pre-sleep relaxation (lying still awake) gets classified as activity.

**Fix:** Add 10-minute buffer before bedtime and after wake time when filtering awake records.

### 8d. RMSSD artifact filtering

**Finding:** No outlier rejection for RR intervals before RMSSD computation. One ectopic beat can shift RMSSD by 10-30ms.

**Fix:** Add ±20% successive difference filter: if `abs(rr[i] - rr[i-1]) / rr[i-1] > 0.20`, exclude the pair.

---

## Implementation Order (by risk)

1. Missing data handling (#2) — safety-critical, produces wrong sleep
2. Motion threshold (#1) — simple constant change
3. Strain min samples (#3) — prevents misleading scores
4. Max HR (#4) — affects all zone-based computations
5. FFT cadence (#5) — biggest code change, highest impact on activity classification
6. Impact normalization (#6) — depends on #5 working
7. HRV rolling window (#7) — additive, no existing code broken
8. Additional corrections (#8a-8d) — targeted fixes

---

## Verification

- `cd backend && npx tsc --noEmit` — compiles
- Existing specs pass: `epoch-features.spec.ts`, `sleep-stage-classifier.spec.ts`, `sleep-stage-engine.spec.ts`
- Seed data → run pipeline → verify:
  - No sleep detected during data gaps (fix #2)
  - Strain is null for bouts < 10 min (fix #3)
  - Activity types change when cadence detection uses FFT (fix #5)
  - MaxHR adapts to observed data (fix #4)
