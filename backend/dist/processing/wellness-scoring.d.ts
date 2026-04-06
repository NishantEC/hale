import { SignalSample, NightFeatureSet, BaselineProfile, SleepDetectionSummary, DailyWellnessScore } from './interfaces';
type NightFeatureBuildOptions = {
    bedtime?: Date | null;
    wakeTime?: Date | null;
    continuity?: number | null;
    regularity?: number | null;
    validCoverage?: number | null;
    sleepEstimateHours?: number | null;
    sourceBlend?: string | null;
};
export declare function buildNightFeatureSet(samples: SignalSample[], referenceDate: Date, baseline: BaselineProfile, options?: NightFeatureBuildOptions): NightFeatureSet;
export declare function applyingSleepDurationFallback(featureSet: NightFeatureSet, durationHours: number): NightFeatureSet;
export declare function effectiveSleepFeatureSet(featureSet: NightFeatureSet, sleepSummary: SleepDetectionSummary | null): NightFeatureSet;
export declare function recomputeBaselineProfile(features: NightFeatureSet[]): BaselineProfile;
export declare function computeDailyScore(featureSet: NightFeatureSet, baseline: BaselineProfile, targetSleepMinutes: number): DailyWellnessScore;
export {};
