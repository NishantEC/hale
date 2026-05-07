import { computeDerivedMetrics } from './derived-metrics';
import type {
  BaselineProfile,
  HistoricalSensorRecord,
  NightFeatureSet,
  SignalSample,
  SleepDetectionSummary,
} from './interfaces';

describe('computeDerivedMetrics', () => {
  it('limits sleep consistency windows and detected-night counts to the selected day', () => {
    const baseline: BaselineProfile = {
      restingHeartRate: 55,
      rmssd: 50,
      sdnn: 35,
      nightsUsed: 7,
      isWarmedUp: true,
      maxHeartRate: null,
    };

    const referenceDate = new Date(2026, 3, 4, 12, 0, 0, 0);

    const sleepDetections: SleepDetectionSummary[] = Array.from({ length: 7 }, (_, index) => {
      const day = index + 1;
      const nightDate = new Date(2026, 3, day, 0, 0, 0, 0);
      const bedtime = new Date(2026, 3, day - 1, 23, 0, 0, 0);
      const wakeTime = new Date(2026, 3, day, 7, 0, 0, 0);
      return {
        nightDate,
        bedtime,
        wakeTime,
        durationHours: 8,
        interruptionCount: 0,
        continuity: 1,
        regularity: 0.9,
        validCoverage: 1,
        confidence: 1,
      };
    });

    const nightFeatures: NightFeatureSet[] = sleepDetections.map((detection) => ({
      nightDate: detection.nightDate,
      restingHeartRate: 55,
      rmssd: 50,
      sdnn: 35,
      respiratoryRate: 14,
      continuity: 1,
      regularity: 0.9,
      validCoverage: 1,
      confidenceRaw: 1,
      sleepEstimateHours: detection.durationHours,
      sourceBlend: 'strap-history',
    }));

    const samples: SignalSample[] = [];
    const sensorRecords: HistoricalSensorRecord[] = [];

    const metrics = computeDerivedMetrics(
      samples,
      sensorRecords,
      nightFeatures,
      sleepDetections,
      baseline,
      referenceDate,
    );

    expect(metrics.detectedSleepNights).toBe(4);
    expect(metrics.sleepConsistencyScore).not.toBeNull();
  });
});
