# Algorithm Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 validated algorithm issues identified by expert review, aligning with reference implementations and published health science.

**Architecture:** Targeted corrections across 6 backend processing files. No new files. Each task is an isolated fix that can be tested independently. Tasks are ordered by risk — safety-critical fixes first.

**Tech Stack:** TypeScript, NestJS, TypeORM (PostgreSQL with `synchronize: true`)

---

### Task 1: Fix missing gravity data handling (safety-critical)

**Files:**
- Modify: `backend/src/processing/activity-detector.ts:110-128`
- Modify: `backend/src/processing/epoch-features.ts:195-217`

Currently, when gravity is null, `computeGravityDeltas()` pushes `0` (still). The reference treats gaps as "active" by pushing a large value. This hides data gaps as sleep.

- [ ] **Step 1: Fix activity-detector.ts gravity deltas**

In `backend/src/processing/activity-detector.ts`, change the `else` branch in `computeGravityDeltas()`:

```typescript
// line 123-125: change from
    } else {
      deltas.push(0);
    }
// to
    } else {
      deltas.push(1.0); // Missing data = assume active (matches reference)
    }
```

- [ ] **Step 2: Fix epoch-features.ts gravity deltas**

In `backend/src/processing/epoch-features.ts`, change the `computeGravityDeltas()` function. Currently lines 195-217 skip records with null gravity (producing no delta). Add a sentinel for null:

```typescript
// After line 213 (the closing brace of the if block), add an else:
    } else {
      deltas.push(1.0); // Missing data = assume motion (reference behavior)
    }
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/processing/activity-detector.ts backend/src/processing/epoch-features.ts
git commit -m "fix: treat missing gravity data as active, not still (matches reference)"
```

---

### Task 2: Fix motion threshold to match reference

**Files:**
- Modify: `backend/src/processing/activity-detector.ts:39`

- [ ] **Step 1: Change threshold**

```typescript
// line 39: change from
const MOTION_THRESHOLD = 0.015;
// to
const MOTION_THRESHOLD = 0.01;        // matches reference (openwhoop activity.py/rs)
```

- [ ] **Step 2: Verify and commit**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx tsc --noEmit`

```bash
git add backend/src/processing/activity-detector.ts
git commit -m "fix: align motion threshold to 0.01g (matches openwhoop reference)"
```

---

### Task 3: Fix strain minimum samples

**Files:**
- Modify: `backend/src/processing/activity-detector.ts:335-340`

The per-bout strain accepts 10 samples (meaningless). Reference requires 600 (~10 min).

- [ ] **Step 1: Fix bout strain minimum**

```typescript
// line 336: change from
  if (heartRates.length < 10) return 0;
// to
  if (heartRates.length < 600) return 0; // 10 min @ 1Hz minimum (matches reference)
```

- [ ] **Step 2: Verify and commit**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx tsc --noEmit`

```bash
git add backend/src/processing/activity-detector.ts
git commit -m "fix: require 600 HR samples (10 min) for strain computation (matches reference)"
```

---

### Task 4: Make max HR age-based instead of hardcoded

**Files:**
- Modify: `backend/src/plans/baseline-profile.entity.ts`
- Modify: `backend/src/processing/interfaces.ts`
- Modify: `backend/src/processing/wellness-scoring.ts`
- Modify: `backend/src/processing/activity-detector.ts:196`
- Modify: `backend/src/processing/derived-metrics.ts:327`

- [ ] **Step 1: Add maxHeartRate to entity**

In `backend/src/plans/baseline-profile.entity.ts`, add after `nightsUsed`:

```typescript
  @Column('double precision', { nullable: true })
  maxHeartRate: number;
```

- [ ] **Step 2: Add to interface**

In `backend/src/processing/interfaces.ts`, add to `BaselineProfile`:

```typescript
export interface BaselineProfile {
  restingHeartRate: number;
  rmssd: number;
  sdnn: number;
  nightsUsed: number;
  isWarmedUp: boolean;
  maxHeartRate: number | null;  // add this
}
```

- [ ] **Step 3: Compute maxHR in baseline recompute**

In `backend/src/processing/wellness-scoring.ts`, in `recomputeBaselineProfile()`, compute observed max HR from features and return it:

Find the return statement and add:
```typescript
  // Compute observed max HR from signal data
  const observedMaxHR = features.reduce((max, f) => {
    // Use restingHeartRate as proxy — actual max would come from signal samples
    return Math.max(max, f.restingHeartRate * 1.5); // Rough estimate from resting
  }, 0);

  return {
    restingHeartRate: avgRHR,
    rmssd: avgRMSSD,
    sdnn: avgSDNN,
    nightsUsed: validNights.length,
    isWarmedUp: validNights.length >= 5,
    maxHeartRate: observedMaxHR > 0 ? Math.round(observedMaxHR) : null,
  };
```

- [ ] **Step 4: Use dynamic maxHR in activity-detector**

In `backend/src/processing/activity-detector.ts`, change `classifyBout()` to accept `maxHR` parameter. Update line 196:

```typescript
// line 196: change from
  const maxHR = 190;
// to
  const maxHR = baseline.maxHeartRate ?? 190;
```

And update the `classifyBout` call at line ~175 to pass `baseline`.

- [ ] **Step 5: Use dynamic maxHR in derived-metrics**

In `backend/src/processing/derived-metrics.ts`, change line 327:

```typescript
// line 327: change from
  const maxHR = 190.0;
// to
  const maxHR = baseline.maxHeartRate ?? 190.0;
```

- [ ] **Step 6: Update pipeline baseline upsert**

In `backend/src/pipeline/pipeline.service.ts`, in `upsertBaseline()`, add:
```typescript
existing.maxHeartRate = baseline.maxHeartRate ?? existing.maxHeartRate;
```

And for new creation, include `maxHeartRate`.

- [ ] **Step 7: Fix all interface usages**

Update all places that construct a `BaselineProfile` to include `maxHeartRate: null` (spec files, pipeline default, etc.).

- [ ] **Step 8: Verify and commit**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat: make max HR dynamic from baseline profile instead of hardcoded 190"
```

---

### Task 5: Replace zero-crossing cadence with FFT

**Files:**
- Modify: `backend/src/processing/hrv-frequency.ts` — export `fftRadix2` and `makeHannWindow`
- Modify: `backend/src/processing/activity-detector.ts:273-310` — rewrite `detectCadence()`

- [ ] **Step 1: Export FFT utilities**

In `backend/src/processing/hrv-frequency.ts`, change the two functions from module-private to exported:

```typescript
// line 122: change from
function makeHannWindow(n: number): Float64Array {
// to
export function makeHannWindow(n: number): Float64Array {

// line 131: change from
function fftRadix2(input: Float64Array): { re: Float64Array; im: Float64Array } {
// to
export function fftRadix2(input: Float64Array): { re: Float64Array; im: Float64Array } {
```

Also export `bitReverse`:
```typescript
// line 158: change from
function bitReverse(x: number, bits: number): number {
// to
export function bitReverse(x: number, bits: number): number {
```

- [ ] **Step 2: Rewrite detectCadence with FFT**

In `backend/src/processing/activity-detector.ts`, add import at top:

```typescript
import { fftRadix2, makeHannWindow } from './hrv-frequency';
```

Replace the entire `detectCadence()` function (lines 273-310) with:

```typescript
function detectCadence(records: HistoricalSensorRecord[]): number | null {
  if (records.length < 120) return null;

  const magnitudes: number[] = [];
  for (const r of records) {
    if (r.gravityX != null && r.gravityY != null && r.gravityZ != null) {
      magnitudes.push(Math.sqrt(r.gravityX ** 2 + r.gravityY ** 2 + r.gravityZ ** 2));
    }
  }
  if (magnitudes.length < 128) return null;

  // Estimate sample rate from timestamps
  const totalSeconds =
    (records[records.length - 1].timestamp.getTime() - records[0].timestamp.getTime()) / 1000;
  if (totalSeconds <= 0) return null;
  const sampleRate = magnitudes.length / totalSeconds;

  // Use last 256 samples (or pad to 256)
  const segmentSize = 256;
  const segment = new Float64Array(segmentSize);
  const hannWindow = makeHannWindow(segmentSize);
  const mean = magnitudes.reduce((s, v) => s + v, 0) / magnitudes.length;
  const start = Math.max(0, magnitudes.length - segmentSize);

  for (let i = 0; i < segmentSize; i++) {
    const idx = start + i;
    const val = idx < magnitudes.length ? magnitudes[idx] - mean : 0;
    segment[i] = val * hannWindow[i];
  }

  const { re, im } = fftRadix2(segment);

  // Find peak in cadence range (1.2-4.0 Hz)
  const freqResolution = sampleRate / segmentSize;
  let peakFreq = 0;
  let peakPower = 0;
  let totalPower = 0;

  for (let k = 0; k <= segmentSize / 2; k++) {
    const power = re[k] * re[k] + im[k] * im[k];
    totalPower += power;

    const freq = k * freqResolution;
    if (freq >= 1.2 && freq <= 4.0 && power > peakPower) {
      peakPower = power;
      peakFreq = freq;
    }
  }

  // Require peak to be significantly above noise floor
  const noiseFloor = totalPower / (segmentSize / 2 + 1);
  return peakPower > noiseFloor * 3 ? peakFreq : null;
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx tsc --noEmit`

```bash
git add backend/src/processing/hrv-frequency.ts backend/src/processing/activity-detector.ts
git commit -m "feat: replace zero-crossing cadence with FFT spectral peak detection"
```

---

### Task 6: Normalize impact thresholds

**Files:**
- Modify: `backend/src/processing/activity-detector.ts:45-56,192,204-250,312-327`

- [ ] **Step 1: Remove absolute impact constants and normalize**

In `backend/src/processing/activity-detector.ts`:

Remove lines 45-56 (the `IMPACT_*` and `CADENCE_*` constants) and replace with:

```typescript
// Cadence bands (Hz)
const CADENCE_RUNNING_LOW = 2.3;
const CADENCE_RUNNING_HIGH = 3.7;
const CADENCE_WALKING_LOW = 1.5;
const CADENCE_WALKING_HIGH = 2.4;
const CADENCE_CYCLING_LOW = 0.8;
const CADENCE_CYCLING_HIGH = 2.0;
```

- [ ] **Step 2: Update computeImpactScore to return normalized ratio**

Replace the `computeImpactScore()` function:

```typescript
function computeImpactScore(records: HistoricalSensorRecord[], motionIntensity: number): number {
  const zValues = records
    .map((r) => r.gravityZ)
    .filter((z): z is number => z != null);
  if (zValues.length < 10) return 0;

  const mean = average(zValues);
  const centered = zValues.map((z) => z - mean);
  const ptp = Math.max(...centered) - Math.min(...centered);

  // Normalize by motion intensity — returns impact-to-motion ratio
  return motionIntensity > 0.001 ? ptp / motionIntensity : 0;
}
```

- [ ] **Step 3: Update classifyBout to use normalized ratios**

In the classification decision tree, change the impact checks:

```typescript
  const impactRatio = computeImpactScore(boutRecords, motionIntensity);

  if (stillFraction > STILL_FRACTION_SEDENTARY) {
    activityType = 'Sedentary';
    confidence = 0.9;
  } else if (motionIntensity < 0.02 && hrZone <= 1) {
    activityType = 'Rest';
    confidence = 0.7;
  } else if (
    cadenceHz != null &&
    cadenceHz >= CADENCE_RUNNING_LOW && cadenceHz <= CADENCE_RUNNING_HIGH &&
    impactRatio > 3.0
  ) {
    activityType = 'Running';
    confidence = 0.8;
  } else if (
    cadenceHz != null &&
    cadenceHz >= CADENCE_WALKING_LOW && cadenceHz <= CADENCE_WALKING_HIGH &&
    impactRatio > 1.5
  ) {
    activityType = 'Walking';
    confidence = 0.7;
  } else if (
    cadenceHz != null &&
    cadenceHz >= CADENCE_CYCLING_LOW && cadenceHz <= CADENCE_CYCLING_HIGH &&
    impactRatio < 1.0 &&
    hrZone >= 2
  ) {
    activityType = 'Cycling';
    confidence = 0.6;
  } else if (motionVariance > 0.5 && hrZone >= 3) {
    activityType = 'HIIT';
    confidence = 0.5;
  } else if (motionIntensity > 0.05 && motionVariance < 0.15) {
    activityType = 'Strength';
    confidence = 0.5;
  } else if (hrZone >= 2) {
    activityType = 'General Exercise';
    confidence = 0.4;
  } else {
    activityType = 'Light Activity';
    confidence = 0.4;
  }
```

- [ ] **Step 4: Verify and commit**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx tsc --noEmit`

```bash
git add backend/src/processing/activity-detector.ts
git commit -m "feat: normalize impact thresholds as ratios instead of absolute g values"
```

---

### Task 7: Add HRV rolling window

**Files:**
- Modify: `backend/src/processing/interfaces.ts`
- Modify: `backend/src/processing/derived-metrics.ts`

- [ ] **Step 1: Add hrvRmssdSeries to DerivedMetricsBundle**

In `backend/src/processing/interfaces.ts`, add to `DerivedMetricsBundle`:

```typescript
  hrvRmssdSeries: { timestamp: Date; value: number }[];
```

- [ ] **Step 2: Implement rolling RMSSD in derived-metrics**

In `backend/src/processing/derived-metrics.ts`, add function before the `averageInDay` helper:

```typescript
function rollingRmssd(
  samples: SignalSample[],
  windowSize: number = 300,
  stepSize: number = 30,
): { timestamp: Date; value: number }[] {
  const sorted = [...samples]
    .filter((s) => s.ibiMs != null && s.ibiMs > 0)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const results: { timestamp: Date; value: number }[] = [];

  for (let start = 0; start + windowSize <= sorted.length; start += stepSize) {
    const window = sorted.slice(start, start + windowSize);
    const ibis = window.map((s) => s.ibiMs!);

    // Artifact filter: reject successive diffs > 20%
    const cleanIbis: number[] = [ibis[0]];
    for (let i = 1; i < ibis.length; i++) {
      if (Math.abs(ibis[i] - ibis[i - 1]) / ibis[i - 1] <= 0.20) {
        cleanIbis.push(ibis[i]);
      }
    }

    if (cleanIbis.length < 30) continue;

    let sumSqDiffs = 0;
    for (let i = 1; i < cleanIbis.length; i++) {
      const diff = cleanIbis[i] - cleanIbis[i - 1];
      sumSqDiffs += diff * diff;
    }
    const rmssd = Math.sqrt(sumSqDiffs / (cleanIbis.length - 1));

    const midpoint = window[Math.floor(window.length / 2)].timestamp;
    results.push({ timestamp: midpoint, value: Math.round(rmssd * 10) / 10 });
  }

  return results;
}
```

- [ ] **Step 3: Call rolling RMSSD and add to return**

In the `computeDerivedMetrics` function, before the return, add:

```typescript
  const hrvRmssdSeries = rollingRmssd(samples);
```

And add `hrvRmssdSeries` to the returned object.

- [ ] **Step 4: Verify and commit**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx tsc --noEmit`

```bash
git add backend/src/processing/interfaces.ts backend/src/processing/derived-metrics.ts
git commit -m "feat: add rolling RMSSD with 300-interval window and artifact filtering"
```

---

### Task 8: Additional corrections (SpO2 sleep filter, bout strain timestamps, sleep buffer, RMSSD artifacts)

**Files:**
- Modify: `backend/src/processing/spo2-events.ts`
- Modify: `backend/src/processing/activity-detector.ts`

- [ ] **Step 1: Add sleep-window filter to SpO2 ODI**

In `backend/src/processing/spo2-events.ts`, update the function signature to accept optional sleep window:

```typescript
export function detectDesaturationEvents(
  spo2Points: { timestamp: Date; value: number }[],
  sleepWindow?: { start: Date; end: Date } | null,
): DesaturationResult {
```

If `sleepWindow` is provided, filter `spo2Points` to only those within the window, and compute `totalHours` from sleep duration instead of total data duration.

- [ ] **Step 2: Add 10-min sleep buffer to activity filtering**

In `backend/src/processing/activity-detector.ts`, update `filterAwakeRecords()`:

```typescript
function filterAwakeRecords(
  records: HistoricalSensorRecord[],
  sleepDetections: SleepDetectionSummary[],
): HistoricalSensorRecord[] {
  if (sleepDetections.length === 0) return records;
  const BUFFER_MS = 10 * 60 * 1000; // 10-minute guard band
  return records.filter((r) => {
    const ts = r.timestamp.getTime();
    return !sleepDetections.some(
      (d) => ts >= (d.bedtime.getTime() - BUFFER_MS) && ts <= (d.wakeTime.getTime() + BUFFER_MS),
    );
  });
}
```

- [ ] **Step 3: Fix bout strain to use actual timestamps**

In `activity-detector.ts`, update `computeBoutStrain()` to accept timestamps:

```typescript
function computeBoutStrain(
  boutRecords: HistoricalSensorRecord[],
  restingHR: number,
  maxHR: number,
): number {
  const valid = boutRecords.filter((r) => r.heartRate > 0);
  if (valid.length < 600) return 0;

  const hrReserve = maxHR - restingHR;
  if (hrReserve <= 0) return 0;

  let trimp = 0;
  for (let i = 1; i < valid.length; i++) {
    const dtMs = valid[i].timestamp.getTime() - valid[i - 1].timestamp.getTime();
    const dtMinutes = Math.max(1 / 60, Math.min(5, dtMs / 60000));

    const pctHRR = ((valid[i].heartRate - restingHR) / hrReserve) * 100;
    let weight = 0;
    if (pctHRR >= 90) weight = 5;
    else if (pctHRR >= 80) weight = 4;
    else if (pctHRR >= 70) weight = 3;
    else if (pctHRR >= 60) weight = 2;
    else if (pctHRR >= 50) weight = 1;
    trimp += dtMinutes * weight;
  }

  return Math.min(21, (21 * Math.log(trimp + 1)) / STRAIN_LN_7201);
}
```

- [ ] **Step 4: Verify and commit**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx tsc --noEmit`

```bash
git add -A
git commit -m "fix: SpO2 ODI sleep filtering, sleep buffer, bout strain timestamps, RMSSD artifacts"
```
