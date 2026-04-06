import { SleepStageSummary, SleepDetectionSummary, NightFeatureSet, BaselineProfile } from './interfaces';
export declare function computeSleepScoreForNight(durationHours: number, targetMinutes: number, stages: SleepStageSummary | null, detection: SleepDetectionSummary | null, features: NightFeatureSet | null, baseline: BaselineProfile): number | null;
