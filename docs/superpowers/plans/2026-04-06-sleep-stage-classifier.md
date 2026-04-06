# Sleep Stage Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the heuristic sleep stage engine with a Random Forest classifier trained on public PSG-labeled datasets, running purely in Node.js with no external dependencies.

**Architecture:** New `epoch-features.ts` extracts 21 features per 30-second window from all available signals. New `sleep-stage-classifier.ts` loads a pre-trained RF model from JSON, classifies epochs, applies physiological smoothing, and outputs the existing `SleepStageSummary` interface. A one-time Python training pipeline in `backend/training/` produces the model JSON artifact.

**Tech Stack:** TypeScript/Node.js (inference), Python/scikit-learn (training), Jest (tests)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `backend/src/processing/epoch-features.ts` | 30s epoch feature extraction from raw signals |
| `backend/src/processing/sleep-stage-classifier.ts` | RF model loading, tree traversal inference, post-processing, summary output |
| `backend/src/processing/models/sleep-rf-v1.json` | Trained RF model artifact (committed to repo) |
| `backend/src/processing/interfaces.ts` | Add `EpochFeature` and `EpochClassification` interfaces |
| `backend/src/pipeline/pipeline.service.ts` | Swap `SleepStageEngine.detect()` for new classifier |
| `backend/src/processing/epoch-features.spec.ts` | Unit tests for feature extraction |
| `backend/src/processing/sleep-stage-classifier.spec.ts` | Unit tests for RF inference and smoothing |
| `backend/training/download_data.py` | Download PhysioNet datasets |
| `backend/training/extract_features.py` | Extract 21 features from raw data into CSV |
| `backend/training/train_model.py` | Train RF, cross-validate, report metrics |
| `backend/training/export_model.py` | Serialize RF to JSON |
| `backend/training/requirements.txt` | Python dependencies |

---

### Task 1: Add interfaces for EpochFeature and EpochClassification

**Files:**
- Modify: `backend/src/processing/interfaces.ts`

- [ ] **Step 1: Add EpochFeature interface**

Add to the end of `backend/src/processing/interfaces.ts`:

```typescript
export interface EpochFeature {
  timestamp: Date;
  hrMean: number;
  hrStd: number;
  hrMin: number;
  hrMax: number;
  hrDeltaFromBaseline: number;
  motionMagnitude: number;
  motionStd: number;
  motionCount: number;
  stillFraction: number;
  rmssd: number;
  sdnn: number;
  rrMean: number;
  respiratoryRate: number;
  respiratoryStd: number;
  spo2: number;
  skinTemp: number;
  skinTempDelta: number;
  clockSin: number;
  clockCos: number;
  skinContact: number;
  signalCompleteness: number;
}

export interface EpochClassification {
  timestamp: Date;
  stage: 'Wake' | 'Light' | 'Deep' | 'REM';
  confidence: number;
  probabilities: [number, number, number, number]; // [wake, light, deep, rem]
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/processing/interfaces.ts
git commit -m "feat: add EpochFeature and EpochClassification interfaces"
```

---

### Task 2: Implement epoch feature extraction

**Files:**
- Create: `backend/src/processing/epoch-features.ts`
- Test: `backend/src/processing/epoch-features.spec.ts`

- [ ] **Step 1: Write failing tests for extractEpochFeatures**

Create `backend/src/processing/epoch-features.spec.ts`:

```typescript
import { extractEpochFeatures } from './epoch-features';
import type { HistoricalSensorRecord } from './interfaces';

function makeRecord(
  offsetSeconds: number,
  overrides: Partial<HistoricalSensorRecord> = {},
): HistoricalSensorRecord {
  return {
    timestamp: new Date(Date.UTC(2026, 3, 6, 0, 0, 0) + offsetSeconds * 1000),
    heartRate: 60,
    rrAverageMs: 1000,
    spo2Red: 500,
    spo2IR: 600,
    skinTempRaw: 800,
    gravityMagnitude: 1.0,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1.0,
    respRateRaw: 14,
    skinContact: true,
    ...overrides,
  };
}

describe('extractEpochFeatures', () => {
  it('produces correct number of 30s epochs for a 5-minute window', () => {
    // 5 minutes = 300 seconds, 1 sample per second = 300 samples → 10 epochs
    const records = Array.from({ length: 300 }, (_, i) => makeRecord(i));
    const bedtime = records[0].timestamp;
    const wakeTime = records[records.length - 1].timestamp;

    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features).toHaveLength(10);
  });

  it('computes HR features correctly for uniform HR', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(i, { heartRate: 60 }),
    );
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);

    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features).toHaveLength(1);
    expect(features[0].hrMean).toBe(60);
    expect(features[0].hrStd).toBe(0);
    expect(features[0].hrMin).toBe(60);
    expect(features[0].hrMax).toBe(60);
    expect(features[0].hrDeltaFromBaseline).toBe(0);
  });

  it('computes motion features from gravity deltas', () => {
    // All records have same gravity → motion deltas are 0 → stillFraction = 1
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(i, { gravityX: 0, gravityY: 0, gravityZ: 1.0, gravityMagnitude: 1.0 }),
    );
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);

    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features[0].stillFraction).toBe(1);
    expect(features[0].motionCount).toBe(0);
  });

  it('encodes clock features as sin/cos of hour', () => {
    // midnight UTC → hour = 0 → sin(0) = 0, cos(0) = 1
    const records = Array.from({ length: 30 }, (_, i) => makeRecord(i));
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);

    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features[0].clockSin).toBeCloseTo(0, 1);
    expect(features[0].clockCos).toBeCloseTo(1, 1);
  });

  it('sets skinContact to 0 when all records have skinContact false', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(i, { skinContact: false }),
    );
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);

    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features[0].skinContact).toBe(0);
  });

  it('computes signalCompleteness based on available signals', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(i, { spo2Red: null, spo2IR: null, skinTempRaw: null }),
    );
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);

    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    // spo2, skinTemp, skinTempDelta are NaN → 18/21 features complete
    expect(features[0].signalCompleteness).toBeCloseTo(18 / 21, 2);
  });

  it('returns empty array when fewer than 30 records', () => {
    const records = Array.from({ length: 5 }, (_, i) => makeRecord(i));
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 5 * 1000);

    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx jest --runInBand epoch-features.spec.ts`
Expected: FAIL — cannot find module `./epoch-features`

- [ ] **Step 3: Implement extractEpochFeatures**

Create `backend/src/processing/epoch-features.ts`:

```typescript
import type { HistoricalSensorRecord, EpochFeature } from './interfaces';
import { average, standardDeviation, median } from './utils';

const EPOCH_SECONDS = 30;
const GRAVITY_STILL_THRESHOLD = 0.01;
const FEATURE_COUNT = 21;

export function extractEpochFeatures(
  records: HistoricalSensorRecord[],
  bedtime: Date,
  wakeTime: Date,
  nightMedianHR: number,
  nightBaselineTemp?: number,
): EpochFeature[] {
  const sorted = records
    .filter(
      (r) =>
        r.timestamp.getTime() >= bedtime.getTime() &&
        r.timestamp.getTime() <= wakeTime.getTime(),
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (sorted.length < EPOCH_SECONDS) return [];

  // Compute night-level skin temperature baseline if not provided
  const nightTempBaseline =
    nightBaselineTemp ??
    (() => {
      const temps = sorted
        .map((r) => r.skinTempRaw)
        .filter((v): v is number => v != null && v >= 100);
      return temps.length > 0 ? median(temps) * 0.04 : NaN;
    })();

  const startMs = bedtime.getTime();
  const endMs = wakeTime.getTime();
  const totalEpochs = Math.floor((endMs - startMs) / (EPOCH_SECONDS * 1000));

  const features: EpochFeature[] = [];

  for (let i = 0; i < totalEpochs; i++) {
    const epochStart = startMs + i * EPOCH_SECONDS * 1000;
    const epochEnd = epochStart + EPOCH_SECONDS * 1000;

    const windowRecords = sorted.filter(
      (r) =>
        r.timestamp.getTime() >= epochStart &&
        r.timestamp.getTime() < epochEnd,
    );

    if (windowRecords.length === 0) continue;

    const epochTimestamp = new Date(epochStart + (EPOCH_SECONDS * 1000) / 2);
    features.push(
      computeEpochFeature(windowRecords, epochTimestamp, nightMedianHR, nightTempBaseline),
    );
  }

  return features;
}

function computeEpochFeature(
  records: HistoricalSensorRecord[],
  timestamp: Date,
  nightMedianHR: number,
  nightTempBaseline: number,
): EpochFeature {
  // HR features
  const heartRates = records.map((r) => r.heartRate).filter((v) => v > 0);
  const hrMean = heartRates.length > 0 ? average(heartRates) : NaN;
  const hrStd = heartRates.length >= 2 ? standardDeviation(heartRates) : 0;
  const hrMin = heartRates.length > 0 ? Math.min(...heartRates) : NaN;
  const hrMax = heartRates.length > 0 ? Math.max(...heartRates) : NaN;
  const hrDeltaFromBaseline =
    nightMedianHR > 0 && !isNaN(hrMean)
      ? (hrMean - nightMedianHR) / nightMedianHR
      : NaN;

  // Motion features from gravity deltas
  const gravityDeltas = computeGravityDeltas(records);
  const motionMagnitude =
    gravityDeltas.length > 0 ? average(gravityDeltas) : NaN;
  const motionStd =
    gravityDeltas.length >= 2 ? standardDeviation(gravityDeltas) : 0;
  const motionCount =
    gravityDeltas.length > 0
      ? gravityDeltas.filter((d) => d > GRAVITY_STILL_THRESHOLD).length
      : 0;
  const stillFraction =
    gravityDeltas.length > 0
      ? gravityDeltas.filter((d) => d <= GRAVITY_STILL_THRESHOLD).length /
        gravityDeltas.length
      : NaN;

  // HRV features
  const ibis = records
    .map((r) => r.rrAverageMs)
    .filter((v): v is number => v != null && v > 0);
  const rmssd = computeRMSSD(ibis);
  const sdnn = ibis.length >= 2 ? standardDeviation(ibis) : NaN;
  const rrMean = ibis.length > 0 ? average(ibis) : NaN;

  // Respiratory features
  const respValues = records
    .map((r) => r.respRateRaw)
    .filter((v): v is number => v != null && v > 0);
  const respiratoryRate = respValues.length > 0 ? average(respValues) : NaN;
  const respiratoryStd =
    respValues.length >= 2 ? standardDeviation(respValues) : NaN;

  // SpO2 (Beer-Lambert ratio)
  const spo2 = computeSpO2(records);

  // Skin temperature
  const tempValues = records
    .map((r) => r.skinTempRaw)
    .filter((v): v is number => v != null && v >= 100);
  const skinTemp =
    tempValues.length > 0 ? average(tempValues) * 0.04 : NaN;
  const skinTempDelta =
    !isNaN(skinTemp) && !isNaN(nightTempBaseline)
      ? skinTemp - nightTempBaseline
      : NaN;

  // Clock features (circadian encoding)
  const hour =
    timestamp.getUTCHours() +
    timestamp.getUTCMinutes() / 60 +
    timestamp.getUTCSeconds() / 3600;
  const clockSin = Math.sin((2 * Math.PI * hour) / 24);
  const clockCos = Math.cos((2 * Math.PI * hour) / 24);

  // Skin contact
  const contactValues = records.map((r) => r.skinContact);
  const skinContact =
    contactValues.every((c) => c === false) ? 0 : 1;

  // Signal completeness
  const featureValues = [
    hrMean, hrStd, hrMin, hrMax, hrDeltaFromBaseline,
    motionMagnitude, motionStd, motionCount, stillFraction,
    rmssd, sdnn, rrMean,
    respiratoryRate, respiratoryStd,
    spo2, skinTemp, skinTempDelta,
    clockSin, clockCos, skinContact,
  ];
  const nonNanCount = featureValues.filter((v) => !isNaN(v)).length + 1; // +1 for signalCompleteness itself
  const signalCompleteness = nonNanCount / FEATURE_COUNT;

  return {
    timestamp,
    hrMean,
    hrStd,
    hrMin,
    hrMax,
    hrDeltaFromBaseline,
    motionMagnitude,
    motionStd,
    motionCount,
    stillFraction,
    rmssd,
    sdnn,
    rrMean,
    respiratoryRate,
    respiratoryStd,
    spo2,
    skinTemp,
    skinTempDelta,
    clockSin,
    clockCos,
    skinContact,
    signalCompleteness,
  };
}

function computeGravityDeltas(
  records: HistoricalSensorRecord[],
): number[] {
  const deltas: number[] = [];
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1];
    const curr = records[i];
    if (
      prev.gravityX != null &&
      prev.gravityY != null &&
      prev.gravityZ != null &&
      curr.gravityX != null &&
      curr.gravityY != null &&
      curr.gravityZ != null
    ) {
      const dx = curr.gravityX - prev.gravityX;
      const dy = curr.gravityY - prev.gravityY;
      const dz = curr.gravityZ - prev.gravityZ;
      deltas.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
  }
  return deltas;
}

function computeRMSSD(ibis: number[]): number {
  if (ibis.length < 2) return NaN;
  let sumSquaredDiffs = 0;
  for (let i = 1; i < ibis.length; i++) {
    const diff = ibis[i] - ibis[i - 1];
    sumSquaredDiffs += diff * diff;
  }
  return Math.sqrt(sumSquaredDiffs / (ibis.length - 1));
}

function computeSpO2(records: HistoricalSensorRecord[]): number {
  const red = records
    .map((r) => r.spo2Red)
    .filter((v): v is number => v != null && v > 0);
  const ir = records
    .map((r) => r.spo2IR)
    .filter((v): v is number => v != null && v > 0);

  if (red.length < 2 || ir.length < 2) return NaN;

  const acRed = standardDeviation(red);
  const dcRed = average(red);
  const acIR = standardDeviation(ir);
  const dcIR = average(ir);

  if (dcRed <= 0 || dcIR <= 0 || acRed <= 0 || acIR <= 0) return NaN;

  const ratio = (acRed / dcRed) / (acIR / dcIR);
  return Math.max(70, Math.min(100, 110.0 - 25.0 * ratio));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx jest --runInBand epoch-features.spec.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Verify build**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add backend/src/processing/epoch-features.ts backend/src/processing/epoch-features.spec.ts
git commit -m "feat: add 30s epoch feature extraction from sensor records"
```

---

### Task 3: Implement Random Forest inference engine

**Files:**
- Create: `backend/src/processing/sleep-stage-classifier.ts`
- Test: `backend/src/processing/sleep-stage-classifier.spec.ts`

- [ ] **Step 1: Write failing tests for RF traversal and classification**

Create `backend/src/processing/sleep-stage-classifier.spec.ts`:

```typescript
import {
  loadModel,
  classifyEpoch,
  classifySleepStages,
} from './sleep-stage-classifier';
import type {
  EpochFeature,
  EpochClassification,
  SleepStageSummary,
  SleepDetectionSummary,
  HistoricalSensorRecord,
} from './interfaces';

// Tiny 2-tree model for testing. Each tree has 3 nodes:
// Node 0: split on feature 0 (hrMean) at threshold 65
//   Left (hrMean <= 65) → Node 1 (leaf: Deep)
//   Right (hrMean > 65) → Node 2 (leaf: Wake)
const TINY_MODEL = {
  nEstimators: 2,
  nFeatures: 21,
  featureNames: [
    'hrMean', 'hrStd', 'hrMin', 'hrMax', 'hrDeltaFromBaseline',
    'motionMagnitude', 'motionStd', 'motionCount', 'stillFraction',
    'rmssd', 'sdnn', 'rrMean',
    'respiratoryRate', 'respiratoryStd',
    'spo2', 'skinTemp', 'skinTempDelta',
    'clockSin', 'clockCos', 'skinContact', 'signalCompleteness',
  ],
  trees: [
    {
      nodes: [
        { featureIndex: 0, threshold: 65, left: 1, right: 2 },
        { featureIndex: -1, threshold: 0, left: -1, right: -1, value: [0.0, 0.1, 0.8, 0.1] },
        { featureIndex: -1, threshold: 0, left: -1, right: -1, value: [0.9, 0.05, 0.0, 0.05] },
      ],
    },
    {
      nodes: [
        { featureIndex: 0, threshold: 65, left: 1, right: 2 },
        { featureIndex: -1, threshold: 0, left: -1, right: -1, value: [0.0, 0.2, 0.7, 0.1] },
        { featureIndex: -1, threshold: 0, left: -1, right: -1, value: [0.8, 0.1, 0.0, 0.1] },
      ],
    },
  ],
};

function makeEpochFeature(
  offsetMinutes: number,
  overrides: Partial<EpochFeature> = {},
): EpochFeature {
  return {
    timestamp: new Date(Date.UTC(2026, 3, 6, 0, 0, 0) + offsetMinutes * 60 * 1000),
    hrMean: 55,
    hrStd: 2,
    hrMin: 52,
    hrMax: 58,
    hrDeltaFromBaseline: -0.08,
    motionMagnitude: 0.002,
    motionStd: 0.001,
    motionCount: 0,
    stillFraction: 1,
    rmssd: 45,
    sdnn: 50,
    rrMean: 1000,
    respiratoryRate: 14,
    respiratoryStd: 1,
    spo2: 97,
    skinTemp: 33,
    skinTempDelta: 0,
    clockSin: 0,
    clockCos: 1,
    skinContact: 1,
    signalCompleteness: 1,
    ...overrides,
  };
}

describe('loadModel', () => {
  it('parses a model JSON object', () => {
    const model = loadModel(TINY_MODEL);
    expect(model.nEstimators).toBe(2);
    expect(model.trees).toHaveLength(2);
  });
});

describe('classifyEpoch', () => {
  it('classifies low HR epoch as Deep', () => {
    const model = loadModel(TINY_MODEL);
    const epoch = makeEpochFeature(0, { hrMean: 55 });
    const result = classifyEpoch(model, epoch);
    expect(result.stage).toBe('Deep');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies high HR epoch as Wake', () => {
    const model = loadModel(TINY_MODEL);
    const epoch = makeEpochFeature(0, { hrMean: 75 });
    const result = classifyEpoch(model, epoch);
    expect(result.stage).toBe('Wake');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe('classifySleepStages', () => {
  it('returns a SleepStageSummary with correct stage minutes', () => {
    const model = loadModel(TINY_MODEL);
    // 20 epochs of low HR (Deep) + 10 epochs of high HR (Wake) = 30 epochs × 0.5 min = 15 min
    const epochs = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeEpochFeature(i * 0.5, { hrMean: 55 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeEpochFeature(10 + i * 0.5, { hrMean: 75 }),
      ),
    ];
    const detection: SleepDetectionSummary = {
      nightDate: new Date(Date.UTC(2026, 3, 6)),
      bedtime: epochs[0].timestamp,
      wakeTime: epochs[epochs.length - 1].timestamp,
      durationHours: 0.25,
      interruptionCount: 0,
      continuity: 1,
      regularity: 0.8,
      validCoverage: 1,
      confidence: 1,
    };

    const summaries = classifySleepStages(model, epochs, [detection]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].deepMinutes).toBeGreaterThan(0);
    expect(summaries[0].awakeMinutes).toBeGreaterThan(0);
    expect(summaries[0].epochMinutes).toBe(0.5);
    expect(summaries[0].source).toBe('RF-v1');
  });

  it('marks entire night as unknown when confidence is too low', () => {
    const model = loadModel(TINY_MODEL);
    // Only 4 epochs — very low feature completeness
    const epochs = Array.from({ length: 4 }, (_, i) =>
      makeEpochFeature(i * 0.5, { hrMean: 55, signalCompleteness: 0.2 }),
    );
    const detection: SleepDetectionSummary = {
      nightDate: new Date(Date.UTC(2026, 3, 6)),
      bedtime: epochs[0].timestamp,
      wakeTime: epochs[epochs.length - 1].timestamp,
      durationHours: 0.03,
      interruptionCount: 0,
      continuity: 0.1,
      regularity: 0.5,
      validCoverage: 0.1,
      confidence: 0.2,
    };

    const summaries = classifySleepStages(model, epochs, [detection]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].unknownMinutes).toBeGreaterThan(0);
    expect(summaries[0].confidence).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx jest --runInBand sleep-stage-classifier.spec.ts`
Expected: FAIL — cannot find module `./sleep-stage-classifier`

- [ ] **Step 3: Implement sleep-stage-classifier.ts**

Create `backend/src/processing/sleep-stage-classifier.ts`:

```typescript
import type {
  EpochFeature,
  EpochClassification,
  SleepStageSummary,
  SleepStageEpoch,
  SleepDetectionSummary,
} from './interfaces';
import { clamp } from './utils';

// --- Model types ---

interface TreeNode {
  featureIndex: number; // -1 for leaf
  threshold: number;
  left: number;
  right: number;
  value?: number[]; // class probabilities for leaf nodes [wake, light, deep, rem]
}

interface DecisionTree {
  nodes: TreeNode[];
}

export interface RFModel {
  nEstimators: number;
  nFeatures: number;
  featureNames: string[];
  trees: DecisionTree[];
}

const STAGE_LABELS: ('Wake' | 'Light' | 'Deep' | 'REM')[] = [
  'Wake',
  'Light',
  'Deep',
  'REM',
];

const EPOCH_MINUTES = 0.5; // 30 seconds

const FEATURE_KEYS: (keyof EpochFeature)[] = [
  'hrMean', 'hrStd', 'hrMin', 'hrMax', 'hrDeltaFromBaseline',
  'motionMagnitude', 'motionStd', 'motionCount', 'stillFraction',
  'rmssd', 'sdnn', 'rrMean',
  'respiratoryRate', 'respiratoryStd',
  'spo2', 'skinTemp', 'skinTempDelta',
  'clockSin', 'clockCos', 'skinContact', 'signalCompleteness',
];

// --- Model loading ---

export function loadModel(json: any): RFModel {
  return {
    nEstimators: json.nEstimators,
    nFeatures: json.nFeatures,
    featureNames: json.featureNames,
    trees: json.trees.map((t: any) => ({
      nodes: t.nodes.map((n: any) => ({
        featureIndex: n.featureIndex,
        threshold: n.threshold,
        left: n.left,
        right: n.right,
        value: n.value ?? undefined,
      })),
    })),
  };
}

// --- Single epoch classification ---

export function classifyEpoch(
  model: RFModel,
  epoch: EpochFeature,
): EpochClassification {
  const featureVector = FEATURE_KEYS.map((key) => {
    const val = epoch[key];
    return typeof val === 'number' ? val : NaN;
  });

  // Average probabilities across all trees
  const avgProbs = [0, 0, 0, 0];
  for (const tree of model.trees) {
    const probs = traverseTree(tree, featureVector);
    for (let j = 0; j < 4; j++) {
      avgProbs[j] += probs[j];
    }
  }
  for (let j = 0; j < 4; j++) {
    avgProbs[j] /= model.nEstimators;
  }

  const maxIdx = avgProbs.indexOf(Math.max(...avgProbs));
  return {
    timestamp: epoch.timestamp,
    stage: STAGE_LABELS[maxIdx],
    confidence: avgProbs[maxIdx],
    probabilities: avgProbs as [number, number, number, number],
  };
}

function traverseTree(tree: DecisionTree, features: number[]): number[] {
  let nodeIdx = 0;
  while (true) {
    const node = tree.nodes[nodeIdx];
    if (node.featureIndex === -1 || node.value != null) {
      // Leaf node
      return node.value ?? [0.25, 0.25, 0.25, 0.25];
    }
    const featureVal = features[node.featureIndex];
    // NaN goes left (like scikit-learn convention for missing values)
    if (isNaN(featureVal) || featureVal <= node.threshold) {
      nodeIdx = node.left;
    } else {
      nodeIdx = node.right;
    }
  }
}

// --- Full night classification pipeline ---

type InternalStage = 'Wake' | 'Light' | 'Deep' | 'REM';
type OutputStage = 'rem' | 'core' | 'deep' | 'awake' | 'unknown';

export function classifySleepStages(
  model: RFModel,
  epochs: EpochFeature[],
  detections: SleepDetectionSummary[],
): SleepStageSummary[] {
  const summaries: SleepStageSummary[] = [];

  for (const detection of detections) {
    const nightEpochs = epochs.filter(
      (e) =>
        e.timestamp.getTime() >= detection.bedtime.getTime() &&
        e.timestamp.getTime() <= detection.wakeTime.getTime(),
    );

    if (nightEpochs.length === 0) continue;

    const sorted = [...nightEpochs].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Classify each epoch
    let classifications = sorted.map((epoch) => classifyEpoch(model, epoch));

    // Apply post-processing
    classifications = applySmoothingRules(classifications, sorted);

    // Compute confidence
    const validCount = sorted.filter((e) => e.signalCompleteness > 0.5).length;
    const featureCompleteness = validCount / Math.max(1, sorted.length);

    const transitions = classifications
      .slice(1)
      .filter((c, i) => c.stage !== classifications[i].stage).length;
    const transitionScore = Math.max(
      0,
      1 - transitions / Math.max(1, Math.floor(sorted.length / 3)),
    );

    const avgConfidence =
      classifications.reduce((sum, c) => sum + c.confidence, 0) /
      Math.max(1, classifications.length);

    const confidence = clamp(
      featureCompleteness * 0.35 + transitionScore * 0.25 + avgConfidence * 0.4,
      0,
      1,
    );

    // Build output
    const totalMinutes = sorted.length * EPOCH_MINUTES;

    if (confidence < 0.5) {
      const unknownTimeline: SleepStageEpoch[] = sorted.map((e) => ({
        timestamp: e.timestamp,
        stage: 'unknown' as const,
      }));
      summaries.push({
        nightDate: detection.nightDate,
        remMinutes: 0,
        coreMinutes: 0,
        deepMinutes: 0,
        awakeMinutes: 0,
        unknownMinutes: totalMinutes,
        confidence,
        source: 'RF-v1',
        epochTimeline: unknownTimeline,
        epochMinutes: EPOCH_MINUTES,
      });
      continue;
    }

    const stageMap: Record<InternalStage, OutputStage> = {
      Wake: 'awake',
      Light: 'core',
      Deep: 'deep',
      REM: 'rem',
    };

    const timeline: SleepStageEpoch[] = classifications.map((c) => ({
      timestamp: c.timestamp,
      stage: stageMap[c.stage],
    }));

    const remMinutes =
      classifications.filter((c) => c.stage === 'REM').length * EPOCH_MINUTES;
    const coreMinutes =
      classifications.filter((c) => c.stage === 'Light').length * EPOCH_MINUTES;
    const deepMinutes =
      classifications.filter((c) => c.stage === 'Deep').length * EPOCH_MINUTES;
    const awakeMinutes =
      classifications.filter((c) => c.stage === 'Wake').length * EPOCH_MINUTES;

    summaries.push({
      nightDate: detection.nightDate,
      remMinutes,
      coreMinutes,
      deepMinutes,
      awakeMinutes,
      unknownMinutes: 0,
      confidence,
      source: 'RF-v1',
      epochTimeline: timeline,
      epochMinutes: EPOCH_MINUTES,
    });
  }

  return summaries.sort(
    (a, b) => a.nightDate.getTime() - b.nightDate.getTime(),
  );
}

// --- Post-processing / smoothing ---

function applySmoothingRules(
  classifications: EpochClassification[],
  epochs: EpochFeature[],
): EpochClassification[] {
  let result = [...classifications];

  // Rule 1: Short-run removal (runs < 2 epochs merged into surrounding stage)
  result = smoothShortRuns(result, 2);

  // Rule 2: Impossible transition filter (Deep↔REM without Light)
  result = filterImpossibleTransitions(result);

  // Rule 3: Wake consolidation (isolated single Wake absorbed unless high motion)
  result = consolidateWake(result, epochs);

  // Rule 4: Low-confidence fallback (confidence < 0.4 → neighborhood majority)
  result = lowConfidenceFallback(result);

  // Rule 5: Skin contact override
  result = skinContactOverride(result, epochs);

  return result;
}

function smoothShortRuns(
  classifications: EpochClassification[],
  minRunLength: number,
): EpochClassification[] {
  if (classifications.length < 3) return [...classifications];
  const result = [...classifications];
  let i = 0;
  while (i < result.length) {
    const current = result[i].stage;
    let end = i + 1;
    while (end < result.length && result[end].stage === current) end++;
    const runLen = end - i;
    if (runLen < minRunLength) {
      const left = i > 0 ? result[i - 1].stage : null;
      const right = end < result.length ? result[end].stage : null;
      const replacement = (left === right ? left : left ?? right) ?? 'Light';
      for (let pos = i; pos < end; pos++) {
        result[pos] = { ...result[pos], stage: replacement as InternalStage };
      }
    }
    i = end;
  }
  return result;
}

function filterImpossibleTransitions(
  classifications: EpochClassification[],
): EpochClassification[] {
  if (classifications.length < 3) return [...classifications];
  const result = [...classifications];

  for (let i = 1; i < result.length - 1; i++) {
    const prev = result[i - 1].stage;
    const curr = result[i].stage;
    const next = result[i + 1].stage;

    // Deep → REM or REM → Deep without Light between
    if (
      (prev === 'Deep' && curr === 'REM') ||
      (prev === 'REM' && curr === 'Deep')
    ) {
      result[i] = { ...result[i], stage: 'Light' };
    }
  }
  return result;
}

function consolidateWake(
  classifications: EpochClassification[],
  epochs: EpochFeature[],
): EpochClassification[] {
  if (classifications.length < 3) return [...classifications];
  const result = [...classifications];

  for (let i = 1; i < result.length - 1; i++) {
    if (result[i].stage !== 'Wake') continue;
    const prev = result[i - 1].stage;
    const next = result[i + 1].stage;
    if (prev === next && prev !== 'Wake') {
      // Absorb unless motion confirms wake
      const motion = epochs[i]?.motionMagnitude ?? 0;
      if (isNaN(motion) || motion <= 0.02) {
        result[i] = { ...result[i], stage: prev };
      }
    }
  }
  return result;
}

function lowConfidenceFallback(
  classifications: EpochClassification[],
): EpochClassification[] {
  const result = [...classifications];
  const windowSize = 10; // 5 minutes at 30s epochs

  for (let i = 0; i < result.length; i++) {
    if (result[i].confidence >= 0.4) continue;

    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(result.length, i + Math.floor(windowSize / 2) + 1);

    const counts: Record<string, number> = {};
    for (let j = start; j < end; j++) {
      if (j === i) continue;
      const stage = result[j].stage;
      counts[stage] = (counts[stage] ?? 0) + 1;
    }

    let maxStage = result[i].stage;
    let maxCount = 0;
    for (const [stage, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxStage = stage as InternalStage;
      }
    }
    result[i] = { ...result[i], stage: maxStage };
  }
  return result;
}

function skinContactOverride(
  classifications: EpochClassification[],
  epochs: EpochFeature[],
): EpochClassification[] {
  return classifications.map((c, i) => {
    if (epochs[i]?.skinContact === 0) {
      return { ...c, stage: 'Wake' as const };
    }
    return c;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx jest --runInBand sleep-stage-classifier.spec.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Verify build**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add backend/src/processing/sleep-stage-classifier.ts backend/src/processing/sleep-stage-classifier.spec.ts
git commit -m "feat: add Random Forest sleep stage classifier with smoothing"
```

---

### Task 4: Create placeholder model JSON

**Files:**
- Create: `backend/src/processing/models/sleep-rf-v1.json`

- [ ] **Step 1: Create the models directory and a minimal placeholder model**

The placeholder model has 3 trees with simple splits on HR, motion, and HRV. This allows the pipeline to run end-to-end before we train a real model. It approximates the existing heuristic logic as tree splits.

```bash
mkdir -p /Users/nishantgupta/Documents/noop/backend/src/processing/models
```

Create `backend/src/processing/models/sleep-rf-v1.json`:

```json
{
  "nEstimators": 3,
  "nFeatures": 21,
  "featureNames": [
    "hrMean", "hrStd", "hrMin", "hrMax", "hrDeltaFromBaseline",
    "motionMagnitude", "motionStd", "motionCount", "stillFraction",
    "rmssd", "sdnn", "rrMean",
    "respiratoryRate", "respiratoryStd",
    "spo2", "skinTemp", "skinTempDelta",
    "clockSin", "clockCos", "skinContact", "signalCompleteness"
  ],
  "trees": [
    {
      "nodes": [
        { "featureIndex": 5, "threshold": 0.02, "left": 1, "right": 6 },
        { "featureIndex": 4, "threshold": -0.05, "left": 2, "right": 3 },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.02, 0.08, 0.85, 0.05] },
        { "featureIndex": 4, "threshold": 0.03, "left": 4, "right": 5 },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.05, 0.80, 0.08, 0.07] },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.05, 0.15, 0.05, 0.75] },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.85, 0.08, 0.02, 0.05] }
      ]
    },
    {
      "nodes": [
        { "featureIndex": 8, "threshold": 0.7, "left": 5, "right": 1 },
        { "featureIndex": 0, "threshold": 62, "left": 2, "right": 3 },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.03, 0.10, 0.80, 0.07] },
        { "featureIndex": 10, "threshold": 60, "left": 4, "right": 6 },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.05, 0.75, 0.10, 0.10] },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.80, 0.10, 0.03, 0.07] },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.07, 0.18, 0.05, 0.70] }
      ]
    },
    {
      "nodes": [
        { "featureIndex": 19, "threshold": 0.5, "left": 5, "right": 1 },
        { "featureIndex": 5, "threshold": 0.015, "left": 2, "right": 6 },
        { "featureIndex": 4, "threshold": -0.03, "left": 3, "right": 4 },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.03, 0.12, 0.78, 0.07] },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.05, 0.55, 0.10, 0.30] },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.90, 0.05, 0.02, 0.03] },
        { "featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [0.82, 0.10, 0.03, 0.05] }
      ]
    }
  ]
}
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `cd /Users/nishantgupta/Documents/noop/backend && node -e "const m = require('./src/processing/models/sleep-rf-v1.json'); console.log('Trees:', m.trees.length, 'Features:', m.nFeatures)"`
Expected: `Trees: 3 Features: 21`

- [ ] **Step 3: Commit**

```bash
git add backend/src/processing/models/sleep-rf-v1.json
git commit -m "feat: add placeholder RF model for sleep stage classification"
```

---

### Task 5: Wire classifier into the pipeline

**Files:**
- Modify: `backend/src/pipeline/pipeline.service.ts:1-30,213-214`

- [ ] **Step 1: Write a test that verifies the pipeline calls the new classifier**

This is an integration-level verification. We'll confirm the pipeline still builds and the import path is correct by running the build after modification.

- [ ] **Step 2: Update pipeline imports**

In `backend/src/pipeline/pipeline.service.ts`, replace the sleep stage engine import:

Replace:
```typescript
import { SleepStageEngine } from '../processing/sleep-stage-engine.js';
```

With:
```typescript
import { extractEpochFeatures } from '../processing/epoch-features.js';
import {
  loadModel,
  classifySleepStages,
} from '../processing/sleep-stage-classifier.js';
import { median } from '../processing/utils.js';
import * as sleepRfModel from '../processing/models/sleep-rf-v1.json';
```

Add a cached model field after the logger in the `PipelineService` class:

Replace:
```typescript
  private readonly logger = new Logger(PipelineService.name);
```

With:
```typescript
  private readonly logger = new Logger(PipelineService.name);
  private readonly rfModel = loadModel(sleepRfModel);
```

- [ ] **Step 3: Replace the SleepStageEngine.detect() call with new classifier**

In the `runPipeline` method, replace:
```typescript
    const sleepStages = SleepStageEngine.detect(sensorRecords, sleepDetections);
```

With:
```typescript
    // Extract epoch features and classify sleep stages using RF model
    const nightMedianHR =
      sensorRecords.length > 0
        ? median(sensorRecords.map((r) => r.heartRate).filter((h) => h > 0))
        : 60;

    const allEpochFeatures = sleepDetections.flatMap((detection) =>
      extractEpochFeatures(
        sensorRecords,
        detection.bedtime,
        detection.wakeTime,
        nightMedianHR,
      ),
    );

    const sleepStages = classifySleepStages(
      this.rfModel,
      allEpochFeatures,
      sleepDetections,
    );
```

- [ ] **Step 4: Add resolveJsonModule to tsconfig if needed**

Check `backend/tsconfig.json` for `"resolveJsonModule": true`. If missing, add it under `compilerOptions`.

- [ ] **Step 5: Verify build**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Run all existing tests**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx jest --runInBand`
Expected: All tests pass (the old `sleep-stage-engine.spec.ts` still passes since it tests the old engine directly; pipeline tests use the new classifier).

- [ ] **Step 7: Commit**

```bash
git add backend/src/pipeline/pipeline.service.ts backend/tsconfig.json
git commit -m "feat: wire RF sleep stage classifier into pipeline, replacing heuristic engine"
```

---

### Task 6: Create Python training pipeline

**Files:**
- Create: `backend/training/requirements.txt`
- Create: `backend/training/download_data.py`
- Create: `backend/training/extract_features.py`
- Create: `backend/training/train_model.py`
- Create: `backend/training/export_model.py`

- [ ] **Step 1: Create requirements.txt**

Create `backend/training/requirements.txt`:

```
numpy>=1.24
scipy>=1.10
scikit-learn>=1.3
pandas>=2.0
wfdb>=4.1
requests>=2.28
```

- [ ] **Step 2: Create download_data.py**

Create `backend/training/download_data.py`:

```python
"""Download sleep-accel and DREAMT datasets from PhysioNet."""

import os
import subprocess
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

DATASETS = {
    "sleep-accel": {
        "url": "https://physionet.org/content/sleep-accel/1.0.0/",
        "dir": "sleep-accel",
    },
    "dreamt": {
        "url": "https://physionet.org/content/dreamt/2.1.0/",
        "dir": "dreamt",
    },
}


def download_dataset(name: str, url: str, target_dir: str) -> None:
    dest = os.path.join(DATA_DIR, target_dir)
    if os.path.exists(dest) and len(os.listdir(dest)) > 0:
        print(f"[skip] {name} already downloaded at {dest}")
        return

    os.makedirs(dest, exist_ok=True)
    print(f"[download] {name} from {url} → {dest}")

    # Use wget for PhysioNet (supports their credentialed access if needed)
    try:
        subprocess.check_call(
            [
                "wget",
                "-r",
                "-N",
                "-c",
                "-np",
                "--no-host-directories",
                "--cut-dirs=3",
                "-P",
                dest,
                url,
            ],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
    except FileNotFoundError:
        print("wget not found. Install wget or download manually:")
        print(f"  Dataset: {name}")
        print(f"  URL: {url}")
        print(f"  Destination: {dest}")
        sys.exit(1)


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    for name, info in DATASETS.items():
        download_dataset(name, info["url"], info["dir"])
    print("[done] All datasets downloaded.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Create extract_features.py**

Create `backend/training/extract_features.py`:

```python
"""Extract 21 epoch features from sleep-accel dataset.

Produces a CSV with one row per 30-second epoch:
  21 feature columns + 1 label column (Wake/Light/Deep/REM).

The same 21 features as epoch-features.ts:
  hrMean, hrStd, hrMin, hrMax, hrDeltaFromBaseline,
  motionMagnitude, motionStd, motionCount, stillFraction,
  rmssd, sdnn, rrMean,
  respiratoryRate, respiratoryStd,
  spo2, skinTemp, skinTempDelta,
  clockSin, clockCos, skinContact, signalCompleteness
"""

import os
import glob
import math
import numpy as np
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "data", "features.csv")
EPOCH_SECONDS = 30

# PSG label mapping: sleep-accel uses 0=Wake, 1=N1, 2=N2, 3=N3, 5=REM
# We map: 0→Wake, 1→Light, 2→Light, 3→Deep, 5→REM
PSG_MAP = {0: "Wake", 1: "Light", 2: "Light", 3: "Deep", 5: "REM"}


def compute_rmssd(ibis: np.ndarray) -> float:
    if len(ibis) < 2:
        return float("nan")
    diffs = np.diff(ibis)
    return float(np.sqrt(np.mean(diffs ** 2)))


def compute_sdnn(ibis: np.ndarray) -> float:
    if len(ibis) < 2:
        return float("nan")
    return float(np.std(ibis, ddof=0))


def extract_epoch_features(
    hr_values: np.ndarray,
    motion_values: np.ndarray,  # acceleration magnitude or counts
    epoch_timestamp_hour: float,
    night_median_hr: float,
) -> dict:
    """Extract features for a single 30s epoch from available signals.

    sleep-accel provides HR and motion (actigraphy counts).
    IBI, respiratory, SpO2, temperature are not available → NaN.
    """
    # HR features
    valid_hr = hr_values[hr_values > 0]
    hr_mean = float(np.mean(valid_hr)) if len(valid_hr) > 0 else float("nan")
    hr_std = float(np.std(valid_hr, ddof=0)) if len(valid_hr) >= 2 else 0.0
    hr_min = float(np.min(valid_hr)) if len(valid_hr) > 0 else float("nan")
    hr_max = float(np.max(valid_hr)) if len(valid_hr) > 0 else float("nan")
    hr_delta = (
        (hr_mean - night_median_hr) / night_median_hr
        if night_median_hr > 0 and not math.isnan(hr_mean)
        else float("nan")
    )

    # Motion features (from actigraphy counts, normalized)
    motion_magnitude = float(np.mean(motion_values)) if len(motion_values) > 0 else float("nan")
    motion_std_val = float(np.std(motion_values, ddof=0)) if len(motion_values) >= 2 else 0.0
    still_threshold = 0.01  # normalized
    motion_count = int(np.sum(motion_values > still_threshold)) if len(motion_values) > 0 else 0
    still_fraction = (
        float(np.sum(motion_values <= still_threshold) / len(motion_values))
        if len(motion_values) > 0
        else float("nan")
    )

    # Clock features
    clock_sin = math.sin(2 * math.pi * epoch_timestamp_hour / 24)
    clock_cos = math.cos(2 * math.pi * epoch_timestamp_hour / 24)

    # Count available features (HR + motion + clock = 11 out of 21 non-NaN)
    available = sum(
        1
        for v in [hr_mean, hr_std, hr_min, hr_max, hr_delta,
                   motion_magnitude, motion_std_val, motion_count, still_fraction]
        if not math.isnan(v) if isinstance(v, float) else True
    )
    signal_completeness = (available + 3) / 21  # +3 for clockSin, clockCos, skinContact

    return {
        "hrMean": hr_mean,
        "hrStd": hr_std,
        "hrMin": hr_min,
        "hrMax": hr_max,
        "hrDeltaFromBaseline": hr_delta,
        "motionMagnitude": motion_magnitude,
        "motionStd": motion_std_val,
        "motionCount": motion_count,
        "stillFraction": still_fraction,
        "rmssd": float("nan"),  # Not available in sleep-accel
        "sdnn": float("nan"),
        "rrMean": float("nan"),
        "respiratoryRate": float("nan"),
        "respiratoryStd": float("nan"),
        "spo2": float("nan"),
        "skinTemp": float("nan"),
        "skinTempDelta": float("nan"),
        "clockSin": clock_sin,
        "clockCos": clock_cos,
        "skinContact": 1.0,  # Assume always on wrist during PSG
        "signalCompleteness": signal_completeness,
    }


def process_sleep_accel() -> pd.DataFrame:
    """Process the sleep-accel dataset into feature rows."""
    accel_dir = os.path.join(DATA_DIR, "sleep-accel")
    if not os.path.exists(accel_dir):
        print(f"[error] sleep-accel not found at {accel_dir}. Run download_data.py first.")
        return pd.DataFrame()

    # sleep-accel structure: each subject has motion.txt, hr.txt, labels.txt, timestamps.txt
    # Find all subject directories
    subject_dirs = sorted(glob.glob(os.path.join(accel_dir, "*")))

    all_rows = []

    for subject_path in subject_dirs:
        if not os.path.isdir(subject_path):
            continue

        hr_file = os.path.join(subject_path, "heart_rate.txt")
        motion_file = os.path.join(subject_path, "motion.txt")
        labels_file = os.path.join(subject_path, "labels.txt")
        timestamps_file = os.path.join(subject_path, "timestamps.txt")

        # Try alternate file locations (sleep-accel has varying structures)
        if not os.path.exists(hr_file):
            # Check for CSV variants
            hr_file_alt = os.path.join(subject_path, "heart_rate.csv")
            if os.path.exists(hr_file_alt):
                hr_file = hr_file_alt

        required_files = [hr_file, motion_file, labels_file]
        if not all(os.path.exists(f) for f in required_files):
            continue

        try:
            hr_data = np.loadtxt(hr_file, delimiter=",") if hr_file.endswith(".csv") else np.loadtxt(hr_file)
            motion_data = np.loadtxt(motion_file, delimiter=",") if motion_file.endswith(".csv") else np.loadtxt(motion_file)
            labels = np.loadtxt(labels_file, dtype=int)
        except Exception as e:
            print(f"[warn] Could not load {subject_path}: {e}")
            continue

        # Normalize motion to [0, 1] range
        if motion_data.max() > 0:
            motion_norm = motion_data / motion_data.max()
        else:
            motion_norm = motion_data

        # Compute night median HR
        night_median_hr = float(np.median(hr_data[hr_data > 0])) if np.any(hr_data > 0) else 60.0

        # Each label corresponds to a 30s epoch
        n_epochs = min(len(labels), len(hr_data) // max(1, EPOCH_SECONDS))

        for epoch_idx in range(n_epochs):
            label_raw = int(labels[epoch_idx])
            if label_raw not in PSG_MAP:
                continue

            label = PSG_MAP[label_raw]

            # Extract HR samples for this epoch
            hr_start = epoch_idx * EPOCH_SECONDS
            hr_end = min(hr_start + EPOCH_SECONDS, len(hr_data))
            epoch_hr = hr_data[hr_start:hr_end]

            # Extract motion samples
            motion_start = epoch_idx * EPOCH_SECONDS
            motion_end = min(motion_start + EPOCH_SECONDS, len(motion_norm))
            epoch_motion = motion_norm[motion_start:motion_end]

            # Approximate hour of day (assume recording starts at ~22:00)
            epoch_hour = (22.0 + (epoch_idx * EPOCH_SECONDS / 3600)) % 24

            features = extract_epoch_features(
                epoch_hr, epoch_motion, epoch_hour, night_median_hr
            )
            features["label"] = label
            features["subject"] = os.path.basename(subject_path)
            all_rows.append(features)

    return pd.DataFrame(all_rows)


def main() -> None:
    print("[extract] Processing sleep-accel dataset...")
    df = process_sleep_accel()

    if df.empty:
        print("[error] No features extracted. Check dataset download.")
        return

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"[done] Extracted {len(df)} epochs from {df['subject'].nunique()} subjects → {OUTPUT_CSV}")
    print(f"  Label distribution: {df['label'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Create train_model.py**

Create `backend/training/train_model.py`:

```python
"""Train a Random Forest classifier on extracted sleep epoch features."""

import os
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import classification_report, confusion_matrix

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
FEATURES_CSV = os.path.join(DATA_DIR, "features.csv")
MODEL_OUTPUT = os.path.join(
    os.path.dirname(__file__),
    "..",
    "src",
    "processing",
    "models",
    "sleep-rf-v1.json",
)

FEATURE_NAMES = [
    "hrMean", "hrStd", "hrMin", "hrMax", "hrDeltaFromBaseline",
    "motionMagnitude", "motionStd", "motionCount", "stillFraction",
    "rmssd", "sdnn", "rrMean",
    "respiratoryRate", "respiratoryStd",
    "spo2", "skinTemp", "skinTempDelta",
    "clockSin", "clockCos", "skinContact", "signalCompleteness",
]

LABEL_MAP = {"Wake": 0, "Light": 1, "Deep": 2, "REM": 3}
LABEL_NAMES = ["Wake", "Light", "Deep", "REM"]


def train() -> RandomForestClassifier:
    print("[train] Loading features...")
    df = pd.read_csv(FEATURES_CSV)
    print(f"  {len(df)} epochs, {df['subject'].nunique()} subjects")

    X = df[FEATURE_NAMES].values.astype(np.float32)
    y = df["label"].map(LABEL_MAP).values

    # Replace NaN with -999 for sklearn (it doesn't handle NaN natively)
    X = np.nan_to_num(X, nan=-999.0)

    print("[train] 5-fold stratified cross-validation...")
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=15,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    y_pred = cross_val_predict(clf, X, y, cv=skf)

    print("\n[results] Cross-validation classification report:")
    print(classification_report(y, y_pred, target_names=LABEL_NAMES))
    print("[results] Confusion matrix:")
    print(confusion_matrix(y, y_pred))

    # Train final model on all data
    print("\n[train] Training final model on all data...")
    clf.fit(X, y)

    return clf


def export_model(clf: RandomForestClassifier) -> None:
    """Export the trained RF as a JSON file matching our TypeScript model format."""
    from export_model import export_rf_to_json

    model_json = export_rf_to_json(clf, FEATURE_NAMES)

    os.makedirs(os.path.dirname(MODEL_OUTPUT), exist_ok=True)
    with open(MODEL_OUTPUT, "w") as f:
        json.dump(model_json, f, indent=None)

    file_size_mb = os.path.getsize(MODEL_OUTPUT) / (1024 * 1024)
    print(f"[export] Model saved to {MODEL_OUTPUT} ({file_size_mb:.1f} MB)")


def main() -> None:
    if not os.path.exists(FEATURES_CSV):
        print(f"[error] Features file not found: {FEATURES_CSV}")
        print("  Run extract_features.py first.")
        return

    clf = train()
    export_model(clf)
    print("[done] Training complete.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Create export_model.py**

Create `backend/training/export_model.py`:

```python
"""Export a scikit-learn RandomForestClassifier to JSON for Node.js inference."""

import json
import numpy as np
from sklearn.ensemble import RandomForestClassifier


def export_rf_to_json(
    clf: RandomForestClassifier, feature_names: list[str]
) -> dict:
    """Convert a trained RF to our JSON model format.

    Output format:
    {
      "nEstimators": int,
      "nFeatures": int,
      "featureNames": [...],
      "trees": [
        {
          "nodes": [
            {"featureIndex": int, "threshold": float, "left": int, "right": int},
            {"featureIndex": -1, "threshold": 0, "left": -1, "right": -1, "value": [p0, p1, p2, p3]},
            ...
          ]
        },
        ...
      ]
    }
    """
    trees = []
    for estimator in clf.estimators_:
        tree = estimator.tree_
        nodes = []
        for i in range(tree.node_count):
            if tree.children_left[i] == -1:
                # Leaf node — normalize class counts to probabilities
                counts = tree.value[i][0]
                total = counts.sum()
                probs = (counts / total).tolist() if total > 0 else [0.25] * 4
                nodes.append({
                    "featureIndex": -1,
                    "threshold": 0,
                    "left": -1,
                    "right": -1,
                    "value": [round(p, 4) for p in probs],
                })
            else:
                nodes.append({
                    "featureIndex": int(tree.feature[i]),
                    "threshold": round(float(tree.threshold[i]), 6),
                    "left": int(tree.children_left[i]),
                    "right": int(tree.children_right[i]),
                })
        trees.append({"nodes": nodes})

    return {
        "nEstimators": len(clf.estimators_),
        "nFeatures": clf.n_features_in_,
        "featureNames": feature_names,
        "trees": trees,
    }


def main() -> None:
    """Standalone usage: load a pickled model and export."""
    import pickle
    import sys

    if len(sys.argv) < 2:
        print("Usage: python export_model.py <model.pkl> [output.json]")
        sys.exit(1)

    model_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "sleep-rf-v1.json"

    with open(model_path, "rb") as f:
        clf = pickle.load(f)

    feature_names = [
        "hrMean", "hrStd", "hrMin", "hrMax", "hrDeltaFromBaseline",
        "motionMagnitude", "motionStd", "motionCount", "stillFraction",
        "rmssd", "sdnn", "rrMean",
        "respiratoryRate", "respiratoryStd",
        "spo2", "skinTemp", "skinTempDelta",
        "clockSin", "clockCos", "skinContact", "signalCompleteness",
    ]

    model_json = export_rf_to_json(clf, feature_names)

    with open(output_path, "w") as f:
        json.dump(model_json, f, indent=None)

    print(f"Exported to {output_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Commit**

```bash
git add backend/training/
git commit -m "feat: add Python training pipeline for sleep stage RF model"
```

---

### Task 7: Add .gitignore for training data

**Files:**
- Create: `backend/training/.gitignore`

- [ ] **Step 1: Create .gitignore**

Create `backend/training/.gitignore`:

```
data/
*.pkl
__pycache__/
*.pyc
.venv/
```

- [ ] **Step 2: Commit**

```bash
git add backend/training/.gitignore
git commit -m "chore: gitignore training data and Python artifacts"
```

---

### Task 8: Run full test suite and verify end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npx jest --runInBand`
Expected: All tests pass.

- [ ] **Step 2: Verify backend build**

Run: `cd /Users/nishantgupta/Documents/noop/backend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Verify Expo app compiles**

Run: `cd /Users/nishantgupta/Documents/noop/app && npm run compile`
Expected: Compiles successfully (no changes to app code in this plan).

- [ ] **Step 4: Verify the placeholder model produces sensible output**

Run a quick smoke test:
```bash
cd /Users/nishantgupta/Documents/noop/backend && node -e "
const { loadModel, classifySleepStages } = require('./dist/processing/sleep-stage-classifier.js');
const { extractEpochFeatures } = require('./dist/processing/epoch-features.js');
const model = require('./src/processing/models/sleep-rf-v1.json');
const rf = loadModel(model);

// Simulate 2 hours of data (240 records at 1/sec → 240 epochs at 30s with some records per epoch)
const records = Array.from({ length: 7200 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 3, 6, 0, 0, 0) + i * 1000),
  heartRate: 55 + Math.sin(i / 600) * 10,
  rrAverageMs: 1000 + Math.sin(i / 300) * 100,
  spo2Red: 500, spo2IR: 600,
  skinTempRaw: 800,
  gravityMagnitude: 1.0,
  gravityX: 0, gravityY: 0, gravityZ: 1.0 + Math.random() * 0.005,
  respRateRaw: 14,
  skinContact: true,
}));

const bedtime = records[0].timestamp;
const wakeTime = records[records.length - 1].timestamp;
const features = extractEpochFeatures(records, bedtime, wakeTime, 55);
const detection = { nightDate: new Date(Date.UTC(2026, 3, 6)), bedtime, wakeTime, durationHours: 2, interruptionCount: 0, continuity: 1, regularity: 0.8, validCoverage: 1, confidence: 1 };
const stages = classifySleepStages(rf, features, [detection]);
console.log('Epochs:', features.length);
console.log('Stages:', JSON.stringify({ rem: stages[0]?.remMinutes, core: stages[0]?.coreMinutes, deep: stages[0]?.deepMinutes, awake: stages[0]?.awakeMinutes, confidence: stages[0]?.confidence?.toFixed(2) }));
"
```
Expected: Prints epoch count (~240) and non-zero stage minutes with confidence > 0.5.
