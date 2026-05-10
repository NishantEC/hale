import type {
  EpochFeature,
  SleepStageSummary,
  SleepStageEpoch,
  SleepDetectionSummary,
} from './interfaces';
import { clamp } from './utils';

const EPOCH_MINUTES = 0.5;
const EPOCH_MS = EPOCH_MINUTES * 60 * 1000;

type Stage = 'awake' | 'rem' | 'core' | 'deep';

const TARGET = { awake: 0.08, rem: 0.22, deep: 0.20 } as const;
const SMOOTH_WINDOW = 6;
const MIN_RUN_LENGTH = 4;

export function classifySleepStages(
  epochs: EpochFeature[],
  detections: SleepDetectionSummary[],
): SleepStageSummary[] {
  const summaries: SleepStageSummary[] = [];

  for (const detection of detections) {
    const nightEpochs = epochs
      .filter(
        (e) =>
          e.timestamp.getTime() >= detection.bedtime.getTime() &&
          e.timestamp.getTime() <= detection.wakeTime.getTime(),
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (nightEpochs.length === 0) continue;

    const stages = classifyNight(nightEpochs);
    const densified = densifyTimeline(
      nightEpochs.map((e, i) => ({ timestamp: e.timestamp, stage: stages[i] })),
      detection.bedtime,
      detection.wakeTime,
    );

    const remMinutes = countStage(densified, 'rem');
    const coreMinutes = countStage(densified, 'core');
    const deepMinutes = countStage(densified, 'deep');
    const awakeMinutes = countStage(densified, 'awake');

    const validCount = nightEpochs.filter((e) => e.signalCompleteness > 0.5).length;
    const featureCompleteness = validCount / Math.max(1, nightEpochs.length);

    const transitions = densified
      .slice(1)
      .filter((c, i) => c.stage !== densified[i].stage).length;
    const transitionScore = Math.max(
      0,
      1 - transitions / Math.max(1, Math.floor(densified.length / 3)),
    );

    const confidence = clamp(
      featureCompleteness * 0.45 +
        transitionScore * 0.25 +
        detection.confidence * 0.30,
      0,
      1,
    );

    if (process.env.DEBUG_SLEEP_STAGES) {
      const counts = stageCounts(densified.map((c) => c.stage as Stage));
      // eslint-disable-next-line no-console
      console.log(
        `[sleep-stage] night=${detection.nightDate.toISOString().slice(0, 10)} ` +
          `epochs=${densified.length} realCoverage=${featureCompleteness.toFixed(2)} ` +
          `transitionScore=${transitionScore.toFixed(2)} confidence=${confidence.toFixed(2)} ` +
          `final=${JSON.stringify(counts)}`,
      );
    }

    summaries.push({
      nightDate: detection.nightDate,
      remMinutes,
      coreMinutes,
      deepMinutes,
      awakeMinutes,
      unknownMinutes: 0,
      confidence,
      source: 'quantile-v1',
      epochTimeline: densified,
      epochMinutes: EPOCH_MINUTES,
    });
  }

  return summaries.sort(
    (a, b) => a.nightDate.getTime() - b.nightDate.getTime(),
  );
}

function classifyNight(epochs: EpochFeature[]): Stage[] {
  const N = epochs.length;

  const hrRaw = epochs.map((e) => (isFiniteNumber(e.hrMean) ? e.hrMean : null));
  const motionRaw = epochs.map((e) =>
    isFiniteNumber(e.motionMagnitude) ? e.motionMagnitude : null,
  );
  const rrStdRaw = epochs.map((e) => (isFiniteNumber(e.sdnn) ? e.sdnn : null));

  const hrValues = hrRaw.filter((v): v is number => v != null);
  const hrP10 = percentile(hrValues, 10);
  const hrP50 = percentile(hrValues, 50);
  const hrP90 = percentile(hrValues, 90);

  const motionValues = motionRaw.filter((v): v is number => v != null);
  const motionP75 = percentile(motionValues, 75);

  const rrStdValues = rrStdRaw.filter((v): v is number => v != null && v > 0);
  const rrStdP75 = percentile(rrStdValues, 75);

  const hrSeries = carryForward(hrRaw, hrP50);
  const motionSeries = carryForward(motionRaw, 0);
  const rrStdSeries = carryForward(rrStdRaw, 0);

  const hrSpan = Math.max(hrP90 - hrP10, 1);

  const wakeScore = (i: number): number => {
    if (epochs[i].skinContact === 0) return Number.POSITIVE_INFINITY;
    const motionNorm = motionP75 > 0 ? motionSeries[i] / motionP75 : 0;
    const hrNorm = (hrSeries[i] - hrP50) / hrSpan;
    return motionNorm * 2.0 + Math.max(0, hrNorm) * 1.5;
  };
  const deepScore = (i: number): number => {
    const motionNorm = motionP75 > 0 ? motionSeries[i] / motionP75 : 0;
    const hrLow = (hrP50 - hrSeries[i]) / hrSpan;
    const rrStdNorm = rrStdP75 > 0 ? rrStdSeries[i] / rrStdP75 : 0;
    const stillness = Math.max(0, 1 - motionNorm);
    return hrLow * 1.5 + (1 - rrStdNorm) * 0.8 + stillness * 0.3;
  };
  const remScore = (i: number): number => {
    const motionNorm = motionP75 > 0 ? motionSeries[i] / motionP75 : 0;
    const rrStdNorm = rrStdP75 > 0 ? rrStdSeries[i] / rrStdP75 : 0;
    const stillness = Math.max(0, 1 - motionNorm);
    return rrStdNorm * 1.5 + stillness * 0.5;
  };

  const stages: Stage[] = new Array(N).fill('core');

  const wakeK = Math.max(1, Math.round(N * TARGET.awake));
  const wakeRanked = rankIndices(N, wakeScore);
  for (let k = 0; k < Math.min(wakeK, wakeRanked.length); k++) {
    stages[wakeRanked[k]] = 'awake';
  }
  for (let i = 0; i < N; i++) {
    if (epochs[i].skinContact === 0) stages[i] = 'awake';
  }

  const deepCandidates: number[] = [];
  for (let i = 0; i < N; i++) if (stages[i] !== 'awake') deepCandidates.push(i);
  const deepRanked = rankIndicesFrom(deepCandidates, deepScore);
  const deepK = Math.round(N * TARGET.deep);
  for (let k = 0; k < Math.min(deepK, deepRanked.length); k++) {
    stages[deepRanked[k]] = 'deep';
  }

  const remCandidates: number[] = [];
  for (let i = 0; i < N; i++) if (stages[i] === 'core') remCandidates.push(i);
  const remRanked = rankIndicesFrom(remCandidates, remScore);
  const remK = Math.round(N * TARGET.rem);
  for (let k = 0; k < Math.min(remK, remRanked.length); k++) {
    stages[remRanked[k]] = 'rem';
  }

  return suppressRareIslands(smoothMedian(stages, SMOOTH_WINDOW), MIN_RUN_LENGTH);
}

function rankIndices(n: number, score: (i: number) => number): number[] {
  const arr: { i: number; s: number }[] = new Array(n);
  for (let i = 0; i < n; i++) arr[i] = { i, s: score(i) };
  arr.sort((a, b) => b.s - a.s);
  return arr.map((x) => x.i);
}

function rankIndicesFrom(
  indices: number[],
  score: (i: number) => number,
): number[] {
  const arr = indices.map((i) => ({ i, s: score(i) }));
  arr.sort((a, b) => b.s - a.s);
  return arr.map((x) => x.i);
}

function percentile(vals: number[], p: number): number {
  if (!vals.length) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

function carryForward(values: (number | null)[], fallback: number): number[] {
  const out: number[] = [];
  let last: number | null = null;
  for (const v of values) {
    if (v != null) last = v;
    out.push(last ?? fallback);
  }
  let firstReal: number | null = null;
  for (const v of values) {
    if (v != null) {
      firstReal = v;
      break;
    }
  }
  if (firstReal != null) {
    for (let i = 0; i < out.length; i++) {
      if (out[i] === fallback && values[i] == null) out[i] = firstReal;
      else break;
    }
  }
  return out;
}

function smoothMedian(input: Stage[], windowSize: number): Stage[] {
  const half = Math.floor(windowSize / 2);
  return input.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(input.length, i + half + 1);
    return modeStage(input.slice(start, end));
  });
}

function modeStage(arr: Stage[]): Stage {
  const counts = new Map<Stage, number>();
  for (const s of arr) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: Stage = arr[0];
  let bestC = 0;
  for (const [k, c] of counts) {
    if (c > bestC) {
      best = k;
      bestC = c;
    }
  }
  return best;
}

function suppressRareIslands(input: Stage[], minRun: number): Stage[] {
  const result = [...input];
  let i = 0;
  while (i < result.length) {
    const cur = result[i];
    let end = i + 1;
    while (end < result.length && result[end] === cur) end++;
    if (end - i < minRun && i > 0 && end < result.length) {
      const left = result[i - 1];
      for (let j = i; j < end; j++) result[j] = left;
    }
    i = end;
  }
  return result;
}

function densifyTimeline(
  classifications: SleepStageEpoch[],
  bedtime: Date,
  wakeTime: Date,
): SleepStageEpoch[] {
  if (classifications.length === 0) return classifications;
  const sorted = [...classifications].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  const totalEpochs = Math.ceil(
    (wakeTime.getTime() - bedtime.getTime()) / EPOCH_MS,
  );
  const dense: SleepStageEpoch[] = [];
  let idx = 0;
  for (let i = 0; i < totalEpochs; i++) {
    const t = bedtime.getTime() + i * EPOCH_MS + EPOCH_MS / 2;
    while (idx + 1 < sorted.length && sorted[idx + 1].timestamp.getTime() <= t)
      idx++;
    const before = sorted[idx];
    const after = sorted[Math.min(idx + 1, sorted.length - 1)];
    const beforeDt = Math.abs(t - before.timestamp.getTime());
    const afterDt = Math.abs(t - after.timestamp.getTime());
    const nearest = afterDt < beforeDt ? after : before;
    if (Math.abs(nearest.timestamp.getTime() - t) < EPOCH_MS / 2) {
      dense.push(nearest);
    } else {
      dense.push({ timestamp: new Date(t), stage: nearest.stage });
    }
  }
  return dense;
}

function countStage(timeline: SleepStageEpoch[], stage: Stage): number {
  return Math.round(timeline.filter((c) => c.stage === stage).length * EPOCH_MINUTES);
}

function stageCounts(stages: Stage[]): Record<Stage, number> {
  const counts: Record<Stage, number> = { awake: 0, rem: 0, core: 0, deep: 0 };
  for (const s of stages) counts[s]++;
  return counts;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
