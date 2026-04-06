import { HistoricalSensorRecord, SleepStageSummary, SleepDetectionSummary } from './interfaces';
export declare class SleepStageEngine {
    static detect(records: HistoricalSensorRecord[], detections?: SleepDetectionSummary[]): SleepStageSummary[];
}
