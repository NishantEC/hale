import { SleepDetectionSummary, SleepStageSummary, SleepTypicalRanges } from './interfaces';
export declare function computeTypicalRanges(detections: SleepDetectionSummary[], stages: SleepStageSummary[], excludeDate: Date): SleepTypicalRanges | null;
