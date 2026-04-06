import { HistoricalSensorRecord, SleepDetectionSummary } from './interfaces';
export declare class SleepEventEngine {
    static detect(records: HistoricalSensorRecord[]): SleepDetectionSummary[];
}
