import { extractEpochFeatures } from './epoch-features';
import type { HistoricalSensorRecord } from './interfaces';

function makeRecord(
  offsetSeconds: number,
  overrides: Partial<HistoricalSensorRecord> = {},
): HistoricalSensorRecord {
  return {
    timestamp: new Date(Date.UTC(2026, 3, 6, 0, 0, 0) + offsetSeconds * 1000),
    heartRate: 60,
    rrAverageMs: 1000,
    spo2Red: 500,
    spo2IR: 600,
    skinTempRaw: 800,
    gravityMagnitude: 1.0,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 1.0,
    respRateRaw: 14,
    skinContact: true,
    ppgGreen: null,
    ppgRedIr: null,
    ambientLight: null,
    ledDrive1: null,
    ledDrive2: null,
    signalQuality: null,
    ...overrides,
  };
}

describe('extractEpochFeatures', () => {
  it('produces correct number of 30s epochs for a 5-minute window', () => {
    const records = Array.from({ length: 300 }, (_, i) => makeRecord(i));
    const bedtime = records[0].timestamp;
    const wakeTime = records[records.length - 1].timestamp;
    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features).toHaveLength(10);
  });

  it('computes HR features correctly for uniform HR', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(i, { heartRate: 60 }),
    );
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);
    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features).toHaveLength(1);
    expect(features[0].hrMean).toBe(60);
    expect(features[0].hrStd).toBe(0);
    expect(features[0].hrMin).toBe(60);
    expect(features[0].hrMax).toBe(60);
    expect(features[0].hrDeltaFromBaseline).toBe(0);
  });

  it('computes motion features from gravity deltas', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(i, { gravityX: 0, gravityY: 0, gravityZ: 1.0, gravityMagnitude: 1.0 }),
    );
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);
    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features[0].stillFraction).toBe(1);
    expect(features[0].motionCount).toBe(0);
  });

  it('encodes clock features as sin/cos of hour', () => {
    const records = Array.from({ length: 30 }, (_, i) => makeRecord(i));
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);
    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features[0].clockSin).toBeCloseTo(0, 1);
    expect(features[0].clockCos).toBeCloseTo(1, 1);
  });

  it('sets skinContact to 0 when all records have skinContact false', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(i, { skinContact: false }),
    );
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 30 * 1000);
    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features[0].skinContact).toBe(0);
  });

  it('drops signalCompleteness when spo2/temp inputs are null', () => {
    // Compare the completeness with vs without the three nullable signals.
    // The exact denominator (FEATURE_COUNT) drifts as new features are
    // added; what matters is that nulling spo2Red/spo2IR/skinTempRaw
    // produces a measurable drop (those signals become NaN downstream).
    const baseline = extractEpochFeatures(
      Array.from({ length: 30 }, (_, i) => makeRecord(i)),
      new Date(Date.UTC(2026, 3, 6, 0, 0, 0)),
      new Date(Date.UTC(2026, 3, 6, 0, 0, 30)),
      60,
    )[0];
    const withNulls = extractEpochFeatures(
      Array.from({ length: 30 }, (_, i) =>
        makeRecord(i, { spo2Red: null, spo2IR: null, skinTempRaw: null }),
      ),
      new Date(Date.UTC(2026, 3, 6, 0, 0, 0)),
      new Date(Date.UTC(2026, 3, 6, 0, 0, 30)),
      60,
    )[0];
    expect(withNulls.signalCompleteness).toBeLessThan(baseline.signalCompleteness);
    // 3 inputs (spo2Red, spo2IR, skinTempRaw) feed at least 3 outputs
    // (spo2, skinTemp, skinTempDelta). Difference should be ≥ 3/FEATURE_COUNT.
    const drop = baseline.signalCompleteness - withNulls.signalCompleteness;
    expect(drop).toBeGreaterThan(0.05);
  });

  it('returns empty array when fewer than 30 records', () => {
    const records = Array.from({ length: 5 }, (_, i) => makeRecord(i));
    const bedtime = records[0].timestamp;
    const wakeTime = new Date(bedtime.getTime() + 5 * 1000);
    const features = extractEpochFeatures(records, bedtime, wakeTime, 60);
    expect(features).toHaveLength(0);
  });
});
