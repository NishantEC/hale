declare class SignalSampleDto {
    timestamp: string;
    source: string;
    heartRate: number;
    ibiMs: number | null;
    motionScore: number | null;
    qualityScore: number;
}
declare class HistoricalSensorRecordDto {
    timestamp: string;
    heartRate: number;
    rrAverageMs: number | null;
    spo2Red: number | null;
    spo2IR: number | null;
    skinTempRaw: number | null;
    gravityMagnitude: number | null;
    gravityX: number | null;
    gravityY: number | null;
    gravityZ: number | null;
    respRateRaw: number | null;
    skinContact: boolean | null;
}
export declare class IngestDto {
    signalSamples?: SignalSampleDto[];
    historicalSensorRecords?: HistoricalSensorRecordDto[];
}
export {};
