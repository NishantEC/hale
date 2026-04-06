# Sleep Stage Classifier Design

**Date:** 2026-04-06
**Goal:** Replace the heuristic sleep stage engine with a Random Forest classifier trained on public PSG-labeled datasets, running purely in Node.js.

---

## Overview

The current `sleep-stage-engine.ts` uses hand-tuned thresholds on HR, motion, and RR intervals to classify 1-minute epochs into Wake/Core/Deep/REM. This design replaces it with:

1. A 30-second epoch feature extraction layer using all available signals
2. A Random Forest classifier loaded from a JSON model file
3. Post-processing smoothing for physiologically plausible hypnograms
4. An offline Python training pipeline (not part of the Node.js runtime)

**Target stages:** Wake, Light (mapped to Core), Deep, REM
**Epoch duration:** 30 seconds
**Training data:** `sleep-accel` (PhysioNet) + DREAMT (PhysioNet)
**Runtime:** Pure Node.js, no native dependencies, no cloud calls
**Expected accuracy:** ~75-80% overall, ~60-70% recall on Deep

---

## Section 1: Epoch Feature Extraction (`epoch-features.ts`)

**Input:** Array of signal samples within a 30-second window + window start/end timestamps.

**Features per 30s epoch (21 total):**

| # | Feature | Source | Computation |
|---|---------|--------|-------------|
| 1 | `hrMean` | HR | mean of HR samples in window |
| 2 | `hrStd` | HR | standard deviation |
| 3 | `hrMin` | HR | minimum |
| 4 | `hrMax` | HR | maximum |
| 5 | `hrDeltaFromBaseline` | HR | (hrMean - nightMedianHR) / nightMedianHR |
| 6 | `motionMagnitude` | gravity XYZ | mean of gravity delta magnitudes |
| 7 | `motionStd` | gravity XYZ | std of gravity deltas |
| 8 | `motionCount` | gravity XYZ | count of deltas > 0.01 threshold |
| 9 | `stillFraction` | gravity XYZ | fraction of samples below 0.01 |
| 10 | `rmssd` | IBI | RMSSD over the window |
| 11 | `sdnn` | IBI | SDNN over the window |
| 12 | `rrMean` | IBI | mean RR interval |
| 13 | `respiratoryRate` | respiratory | mean breaths/min |
| 14 | `respiratoryStd` | respiratory | std of respiratory signal |
| 15 | `spo2` | red/IR | Beer-Lambert ratio (existing formula) |
| 16 | `skinTemp` | temperature | raw * 0.04 |
| 17 | `skinTempDelta` | temperature | delta from night baseline |
| 18 | `clockSin` | timestamp | sin(2pi * hour/24) |
| 19 | `clockCos` | timestamp | cos(2pi * hour/24) |
| 20 | `skinContact` | skin contact | 1.0 or 0.0 |
| 21 | `signalCompleteness` | all | fraction of non-null features in this epoch |

**Missing data:** Features set to `NaN` when signal unavailable. Imputed with night median before inference, or handled by RF's native NaN support.

**Output:** `EpochFeature` object with all 21 fields + epoch timestamp.

---

## Section 2: Random Forest Classifier (`sleep-stage-classifier.ts`)

**Model format:** JSON file containing full tree structure:

```json
{
  "nEstimators": 100,
  "nFeatures": 21,
  "featureNames": ["hrMean", "hrStd", "..."],
  "trees": [
    {
      "nodes": [
        { "featureIndex": 6, "threshold": 0.012, "left": 1, "right": 2 },
        { "featureIndex": -1, "value": [0.05, 0.60, 0.25, 0.10] }
      ]
    }
  ]
}
```

**Inference:**
1. Load model JSON once at startup (cached in memory)
2. For each epoch, traverse all 100 trees
3. Each leaf outputs class probabilities [wake, light, deep, rem]
4. Average probabilities across all trees
5. Argmax -> predicted stage
6. Max probability -> confidence score

**Output per epoch:**

```typescript
interface EpochClassification {
  timestamp: Date;
  stage: 'Wake' | 'Light' | 'Deep' | 'REM';
  confidence: number;
  probabilities: number[];
}
```

**Stage mapping:** Wake -> awakeMinutes, Light -> coreMinutes, Deep -> deepMinutes, REM -> remMinutes.

**No external dependencies.** Tree traversal is ~50 lines. Model JSON is ~1-5 MB.

---

## Section 3: Post-Processing & Smoothing

**Rules applied in order:**

1. **Short-run removal:** Runs < 2 epochs (< 1 min) merged into surrounding stage.
2. **Impossible transition filter:** Direct Deep<->REM transitions without intervening Light — shorter segment reclassified as Light.
3. **Wake consolidation:** Isolated single Wake epochs absorbed into surrounding sleep stage, unless motionMagnitude > 0.02 confirms wake.
4. **Low-confidence fallback:** Epochs with RF confidence < 0.4 defer to 5-minute neighborhood majority vote.
5. **Skin contact override:** skinContact === false forces Wake regardless of RF output.

**Night confidence:** Weighted combination of feature completeness, continuity, and transition smoothness. Nights below 0.5 -> all stages marked unknown.

**Output:** Smoothed classifications summarized into existing `SleepStageSummary` interface.

---

## Section 4: Training Pipeline

**Location:** `backend/training/` (Python, not part of Node.js runtime)

**Scripts:**

1. **`download_data.py`** — Downloads `sleep-accel` and DREAMT from PhysioNet into `training/data/`.

2. **`extract_features.py`** — Reads raw signals, segments into 30s epochs, computes the same 21 features. Feature computation duplicated in Python (numpy) to match Node.js exactly. Outputs CSV: one row per epoch, 21 feature columns + label.

3. **`train_model.py`** — Trains `RandomForestClassifier(n_estimators=100, max_depth=15)`. Train on `sleep-accel` first (HR + motion only, others NaN), then retrain on combined datasets. 5-fold cross-validation with per-stage precision/recall/F1.

4. **`export_model.py`** — Serializes trained RF to JSON format. Output: `backend/src/processing/models/sleep-rf-v1.json`.

**Not deployed, not in CI.** Runs on developer machine. JSON artifact committed to repo.

---

## Section 5: Pipeline Integration

**Changes to `pipeline.service.ts`:**
- Replace `SleepStageEngine.detect()` call with:
  1. `extractEpochFeatures()` — 30s epoch features from signal samples within each detected night window
  2. `classifySleepStages()` — RF inference + post-processing + summary
- Output remains `SleepStageSummary` — everything downstream unchanged

**New files:**
- `backend/src/processing/epoch-features.ts`
- `backend/src/processing/sleep-stage-classifier.ts`
- `backend/src/processing/models/sleep-rf-v1.json`
- `backend/training/download_data.py`
- `backend/training/extract_features.py`
- `backend/training/train_model.py`
- `backend/training/export_model.py`

**Modified files:**
- `backend/src/processing/pipeline.service.ts` — swap stage engine for classifier
- `backend/src/processing/interfaces.ts` — add `EpochFeature` and `EpochClassification` interfaces

**Kept until validated:**
- `sleep-stage-engine.ts` — no longer called, removed after validation

**Tests:**
- `epoch-features.spec.ts` — unit tests for feature computation with known inputs
- `sleep-stage-classifier.spec.ts` — unit tests with a tiny 3-tree model JSON, verify traversal and stage output
- Integration test: synthetic night through full pipeline, assert reasonable stage distribution
