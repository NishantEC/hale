import { SleepStageEngine } from './sleep-stage-engine';
import type { HistoricalSensorRecord, SleepDetectionSummary } from './interfaces';

function makeRecord(timestamp: Date): HistoricalSensorRecord {
  return {
    timestamp,
    heartRate: 55,
    rrAverageMs: 1_090,
    spo2Red: null,
    spo2IR: null,
    skinTempRaw: null,
    gravityMagnitude: 1,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1,
    respRateRaw: 14,
    skinContact: true,
  };
}

describe('SleepStageEngine', () => {
  it('keys overnight stages to the wake-date night and ignores epochs outside the detected window', () => {
    const bedtime = new Date(2026, 3, 5, 23, 0, 0, 0);
    const wakeTime = new Date(2026, 3, 6, 1, 36, 0, 0);
    const detection: SleepDetectionSummary = {
      nightDate: new Date(2026, 3, 6, 0, 0, 0, 0),
      bedtime,
      wakeTime,
      durationHours: 2.6,
      interruptionCount: 0,
      continuity: 1,
      regularity: 0.8,
      validCoverage: 1,
      confidence: 1,
    };

    const overnightRecords = Array.from({ length: 40 }, (_, index) =>
      makeRecord(new Date(bedtime.getTime() + index * 4 * 60 * 1000)),
    );
    const daytimeNoise = Array.from({ length: 10 }, (_, index) =>
      makeRecord(new Date(2026, 3, 6, 12, index, 0, 0)),
    );

    const stages = SleepStageEngine.detect(
      [...overnightRecords, ...daytimeNoise],
      [detection],
    );

    expect(stages).toHaveLength(1);
    expect(stages[0].nightDate.getTime()).toBe(detection.nightDate.getTime());
    expect(stages[0].epochTimeline).toHaveLength(overnightRecords.length);
  });
});
