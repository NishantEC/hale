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
      return node.value ?? [0.25, 0.25, 0.25, 0.25];
    }
    const featureVal = features[node.featureIndex];
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

    let classifications = sorted.map((epoch) => classifyEpoch(model, epoch));

    classifications = applySmoothingRules(classifications, sorted);

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
      featureCompleteness * 0.30 +
        transitionScore * 0.20 +
        avgConfidence * 0.30 +
        detection.confidence * 0.20,
      0,
      1,
    );

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

  result = smoothShortRuns(result, 2);
  result = filterImpossibleTransitions(result);
  result = consolidateWake(result, epochs);
  result = lowConfidenceFallback(result);
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
  const windowSize = 10;

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
