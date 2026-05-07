import {
  SleepStageSummary,
  SleepDetectionSummary,
  NightFeatureSet,
  BaselineProfile,
} from './interfaces';
import { clamp } from './utils';

export function computeSleepScoreForNight(
  durationHours: number,
  targetMinutes: number,
  stages: SleepStageSummary | null,
  detection: SleepDetectionSummary | null,
  features: NightFeatureSet | null,
  baseline: BaselineProfile,
): number | null {
  const targetHours = Math.max(0.5, targetMinutes / 60.0);
  const durationScore = Math.min(1.0, durationHours / targetHours) * 30;

  let stageScore = 10;
  if (stages != null) {
    const total =
      stages.remMinutes +
      stages.coreMinutes +
      stages.deepMinutes +
      stages.awakeMinutes +
      stages.unknownMinutes;
    if (total > 0) {
      stageScore =
        Math.min(1.0, stages.deepMinutes / total / 0.2) * 10 +
        Math.min(1.0, stages.remMinutes / total / 0.25) * 10;
    }
  }

  let efficiencyScore = 10;
  if (detection != null) {
    const tib =
      (detection.wakeTime.getTime() - detection.bedtime.getTime()) / 3_600_000;
    if (tib > 0) {
      efficiencyScore = Math.min(1.0, detection.durationHours / tib) * 15;
    }
  }

  const continuityScore = (detection?.continuity ?? 0.5) * 15;

  let hrvBoost = 10;
  if (features != null && baseline.isWarmedUp) {
    const delta =
      (features.rmssd - baseline.rmssd) / Math.max(baseline.rmssd, 1);
    hrvBoost = clamp(10 + delta * 30, 0, 20);
  }

  const raw = Math.round(
    durationScore + stageScore + efficiencyScore + continuityScore + hrvBoost,
  );
  return clamp(raw, 0, 100);
}
