import { classifySleepStages } from './sleep-stage-classifier';
import type { EpochFeature, SleepDetectionSummary } from './interfaces';

function makeEpochFeature(
  offsetMinutes: number,
  overrides: Partial<EpochFeature> = {},
): EpochFeature {
  return {
    timestamp: new Date(Date.UTC(2026, 3, 6, 0, 0, 0) + offsetMinutes * 60 * 1000),
    hrMean: 60,
    hrStd: 2,
    hrMin: 58,
    hrMax: 62,
    hrDeltaFromBaseline: -0.05,
    motionMagnitude: 0.005,
    motionStd: 0.001,
    motionCount: 0,
    stillFraction: 1,
    rmssd: 45,
    sdnn: 50,
    rrMean: 1000,
    respiratoryRate: 14,
    respiratoryStd: 1,
    spo2: 97,
    skinTemp: 33,
    skinTempDelta: 0,
    clockSin: 0,
    clockCos: 1,
    skinContact: 1,
    signalCompleteness: 1,
    ambientLightMean: 0,
    ppgConfidence: 0.9,
    deviceSignalQuality: 0.95,
    lfPower: NaN,
    hfPower: NaN,
    lfHfRatio: NaN,
    rsaAmplitude: NaN,
    ...overrides,
  };
}

function makeDetection(
  bedtime: Date,
  wakeTime: Date,
  overrides: Partial<SleepDetectionSummary> = {},
): SleepDetectionSummary {
  return {
    nightDate: new Date(Date.UTC(2026, 3, 6)),
    bedtime,
    wakeTime,
    durationHours: (wakeTime.getTime() - bedtime.getTime()) / 3_600_000,
    interruptionCount: 0,
    continuity: 1,
    regularity: 0.8,
    validCoverage: 1,
    confidence: 1,
    ...overrides,
  };
}

describe('classifySleepStages (quantile)', () => {
  it('emits a summary with quantile-v1 source', () => {
    const epochs = Array.from({ length: 100 }, (_, i) =>
      makeEpochFeature(i * 0.5, { hrMean: 60 + Math.sin(i / 5) * 5, sdnn: 40 + (i % 7) * 5 }),
    );
    const detection = makeDetection(
      epochs[0].timestamp,
      epochs[epochs.length - 1].timestamp,
    );
    const summaries = classifySleepStages(epochs, [detection]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].source).toBe('quantile-v1');
    expect(summaries[0].epochMinutes).toBe(0.5);
  });

  it('produces all four stages on a varied night', () => {
    const epochs = Array.from({ length: 120 }, (_, i) => {
      const segment = Math.floor(i / 30);
      const hr = [58, 60, 64, 62][segment];
      const motion = [0.001, 0.001, 0.04, 0.002][segment];
      const sdnn = [30, 45, 60, 50][segment];
      return makeEpochFeature(i * 0.5, { hrMean: hr, motionMagnitude: motion, sdnn });
    });
    const detection = makeDetection(
      epochs[0].timestamp,
      epochs[epochs.length - 1].timestamp,
    );
    const summaries = classifySleepStages(epochs, [detection]);
    const s = summaries[0];
    expect(s.remMinutes + s.coreMinutes + s.deepMinutes + s.awakeMinutes).toBeGreaterThan(0);
    expect(s.deepMinutes).toBeGreaterThan(0);
    expect(s.coreMinutes).toBeGreaterThan(0);
  });

  it('forces wake when skinContact is 0', () => {
    const epochs = Array.from({ length: 60 }, (_, i) =>
      makeEpochFeature(i * 0.5, { skinContact: i < 10 ? 0 : 1 }),
    );
    const detection = makeDetection(
      epochs[0].timestamp,
      epochs[epochs.length - 1].timestamp,
    );
    const summaries = classifySleepStages(epochs, [detection]);
    expect(summaries[0].awakeMinutes).toBeGreaterThan(0);
    const earlyEpochs = summaries[0].epochTimeline.slice(0, 5);
    expect(earlyEpochs.every((e) => e.stage === 'awake')).toBe(true);
  });

  it('sums stage minutes to approximately the in-bed duration', () => {
    const epochs = Array.from({ length: 80 }, (_, i) =>
      makeEpochFeature(i * 0.5, { hrMean: 60 + (i % 9) }),
    );
    const detection = makeDetection(
      epochs[0].timestamp,
      epochs[epochs.length - 1].timestamp,
    );
    const inBedMin = Math.round(
      (detection.wakeTime.getTime() - detection.bedtime.getTime()) / 60_000,
    );
    const summaries = classifySleepStages(epochs, [detection]);
    const totalMin =
      summaries[0].remMinutes +
      summaries[0].coreMinutes +
      summaries[0].deepMinutes +
      summaries[0].awakeMinutes;
    expect(Math.abs(totalMin - inBedMin)).toBeLessThanOrEqual(2);
  });

  it('reduces confidence when feature completeness is low', () => {
    const epochs = Array.from({ length: 40 }, (_, i) =>
      makeEpochFeature(i * 0.5, { signalCompleteness: 0.2 }),
    );
    const detection = makeDetection(
      epochs[0].timestamp,
      epochs[epochs.length - 1].timestamp,
      { confidence: 0.3, validCoverage: 0.2, continuity: 0.3 },
    );
    const summaries = classifySleepStages(epochs, [detection]);
    expect(summaries[0].confidence).toBeLessThan(0.5);
    expect(summaries[0].unknownMinutes).toBe(0);
    for (const epoch of summaries[0].epochTimeline) {
      expect(epoch.stage).not.toBe('unknown');
    }
  });

  it('returns empty array when no epochs match detection', () => {
    const detection = makeDetection(
      new Date(Date.UTC(2026, 3, 6)),
      new Date(Date.UTC(2026, 3, 6, 8)),
    );
    expect(classifySleepStages([], [detection])).toEqual([]);
  });
});
