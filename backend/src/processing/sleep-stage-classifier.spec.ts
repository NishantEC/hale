import {
  loadModel,
  classifyEpoch,
  classifySleepStages,
} from './sleep-stage-classifier';
import type {
  EpochFeature,
  EpochClassification,
  SleepStageSummary,
  SleepDetectionSummary,
} from './interfaces';

// Tiny 2-tree model for testing. Each tree has 3 nodes:
// Node 0: split on feature 0 (hrMean) at threshold 65
//   Left (hrMean <= 65) → Node 1 (leaf: Deep)
//   Right (hrMean > 65) → Node 2 (leaf: Wake)
const TINY_MODEL = {
  nEstimators: 2,
  nFeatures: 21,
  featureNames: [
    'hrMean', 'hrStd', 'hrMin', 'hrMax', 'hrDeltaFromBaseline',
    'motionMagnitude', 'motionStd', 'motionCount', 'stillFraction',
    'rmssd', 'sdnn', 'rrMean',
    'respiratoryRate', 'respiratoryStd',
    'spo2', 'skinTemp', 'skinTempDelta',
    'clockSin', 'clockCos', 'skinContact', 'signalCompleteness',
  ],
  trees: [
    {
      nodes: [
        { featureIndex: 0, threshold: 65, left: 1, right: 2 },
        { featureIndex: -1, threshold: 0, left: -1, right: -1, value: [0.0, 0.1, 0.8, 0.1] },
        { featureIndex: -1, threshold: 0, left: -1, right: -1, value: [0.9, 0.05, 0.0, 0.05] },
      ],
    },
    {
      nodes: [
        { featureIndex: 0, threshold: 65, left: 1, right: 2 },
        { featureIndex: -1, threshold: 0, left: -1, right: -1, value: [0.0, 0.2, 0.7, 0.1] },
        { featureIndex: -1, threshold: 0, left: -1, right: -1, value: [0.8, 0.1, 0.0, 0.1] },
      ],
    },
  ],
};

function makeEpochFeature(
  offsetMinutes: number,
  overrides: Partial<EpochFeature> = {},
): EpochFeature {
  return {
    timestamp: new Date(Date.UTC(2026, 3, 6, 0, 0, 0) + offsetMinutes * 60 * 1000),
    hrMean: 55,
    hrStd: 2,
    hrMin: 52,
    hrMax: 58,
    hrDeltaFromBaseline: -0.08,
    motionMagnitude: 0.002,
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

describe('loadModel', () => {
  it('parses a model JSON object', () => {
    const model = loadModel(TINY_MODEL);
    expect(model.nEstimators).toBe(2);
    expect(model.trees).toHaveLength(2);
  });
});

describe('classifyEpoch', () => {
  it('classifies low HR epoch as Deep', () => {
    const model = loadModel(TINY_MODEL);
    const epoch = makeEpochFeature(0, { hrMean: 55 });
    const result = classifyEpoch(model, epoch);
    expect(result.stage).toBe('Deep');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies high HR epoch as Wake', () => {
    const model = loadModel(TINY_MODEL);
    const epoch = makeEpochFeature(0, { hrMean: 75 });
    const result = classifyEpoch(model, epoch);
    expect(result.stage).toBe('Wake');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe('classifySleepStages', () => {
  it('returns a SleepStageSummary with correct stage minutes', () => {
    const model = loadModel(TINY_MODEL);
    const epochs = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeEpochFeature(i * 0.5, { hrMean: 55 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeEpochFeature(10 + i * 0.5, { hrMean: 75 }),
      ),
    ];
    const detection: SleepDetectionSummary = {
      nightDate: new Date(Date.UTC(2026, 3, 6)),
      bedtime: epochs[0].timestamp,
      wakeTime: epochs[epochs.length - 1].timestamp,
      durationHours: 0.25,
      interruptionCount: 0,
      continuity: 1,
      regularity: 0.8,
      validCoverage: 1,
      confidence: 1,
    };

    const summaries = classifySleepStages(model, epochs, [detection]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].deepMinutes).toBeGreaterThan(0);
    expect(summaries[0].awakeMinutes).toBeGreaterThan(0);
    expect(summaries[0].epochMinutes).toBe(0.5);
    expect(summaries[0].source).toBe('RF-v1');
  });

  it('marks entire night as unknown when confidence is too low', () => {
    const model = loadModel(TINY_MODEL);
    const epochs = Array.from({ length: 4 }, (_, i) =>
      makeEpochFeature(i * 0.5, { hrMean: 55, signalCompleteness: 0.2 }),
    );
    const detection: SleepDetectionSummary = {
      nightDate: new Date(Date.UTC(2026, 3, 6)),
      bedtime: epochs[0].timestamp,
      wakeTime: epochs[epochs.length - 1].timestamp,
      durationHours: 0.03,
      interruptionCount: 0,
      continuity: 0.1,
      regularity: 0.5,
      validCoverage: 0.1,
      confidence: 0.2,
    };

    const summaries = classifySleepStages(model, epochs, [detection]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].unknownMinutes).toBeGreaterThan(0);
    expect(summaries[0].confidence).toBeLessThan(0.5);
  });
});
