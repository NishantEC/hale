import type {
  SignalSample,
  HistoricalSensorRecord,
  NightFeatureSet,
  SleepDetectionSummary,
  BaselineProfile,
  DerivedMetricsBundle,
} from '../processing/interfaces.js';
import type {
  ComputeDerivedMetricsDayRequestV1,
  PersistedDailyMetricV1,
} from './compute-engine-types.js';

interface BuildArgs {
  samples: SignalSample[];
  sensorRecords: HistoricalSensorRecord[];
  effectiveFeatures: NightFeatureSet[];
  sleepDetections: SleepDetectionSummary[];
  baseline: BaselineProfile;
  dayDate: Date;
  timeZone: string;
}

const toIso = (d: Date | string) =>
  typeof d === 'string' ? d : d.toISOString();

export function buildDayRequest(
  args: BuildArgs,
): ComputeDerivedMetricsDayRequestV1 {
  // Project to ONLY the fields the Rust compute path actually reads. Dropping
  // the unused fields (gravity*, ppg*, ledDrive*, ambientLight, signalQuality,
  // respRateRaw, motionScore, qualityScore, source) cuts raw payload from
  // ~103 MiB to ~17 MiB on the heaviest user — well under Cloud Run's 32 MiB
  // ingress limit even before gzip. Pre-filtering sensorRecords to rows with
  // all three sensor fields non-null mirrors precomputeMetricSeries.
  const samples = args.samples.map((s) => ({
    timestamp: toIso(s.timestamp),
    heartRate: s.heartRate,
    ibiMs: s.ibiMs,
  }));
  const sensorRecords = args.sensorRecords
    .filter(
      (r) =>
        r.spo2Red != null && r.spo2IR != null && r.skinTempRaw != null,
    )
    .map((r) => ({
      timestamp: toIso(r.timestamp),
      heartRate: r.heartRate,
      spo2Red: r.spo2Red,
      spo2IR: r.spo2IR,
      skinTempRaw: r.skinTempRaw,
    }));
  return {
    schemaVersion: 1,
    samples: samples as any,
    sensorRecords: sensorRecords as any,
    nightFeatures: args.effectiveFeatures.map((f) => ({
      ...f,
      nightDate: toIso(f.nightDate),
    })) as any,
    sleepDetections: args.sleepDetections.map((d) => ({
      ...d,
      nightDate: toIso(d.nightDate),
      bedtime: toIso(d.bedtime),
      wakeTime: toIso(d.wakeTime),
    })) as any,
    baseline: args.baseline,
    referenceDate: args.dayDate.toISOString().slice(0, 10),
    timeZone: args.timeZone,
  };
}

export function liftPersistedToBundle(
  p: PersistedDailyMetricV1,
): DerivedMetricsBundle {
  return {
    stressScores: [],
    spo2Scores: [],
    skinTempScores: [],
    hrvRmssdSeries: [],
    strainScore: p.strainScore,
    sleepConsistencyScore: p.sleepConsistencyScore,
    detectedSleepNights: p.detectedSleepNights,
    skinTempAvgCelsius: p.skinTempAvgCelsius,
    skinTempDeltaCelsius: p.skinTempDeltaCelsius,
    stressAverage: p.stressAverage,
    spo2Average: p.spo2Average,
    lfHfRatioAverage: p.lfHfRatioAverage,
    recoveryIndex: p.recoveryIndex,
    trainingLoadRatio: p.trainingLoadRatio,
    trainingLoadRiskZone: p.trainingLoadRiskZone,
    spo2DipCount: p.spo2DipCount,
    odiPerHour: p.odiPerHour,
    lowestSpo2: p.lowestSpo2,
    coreTemperatureEstimate: p.coreTemperatureEstimate,
    circadianNadir: p.circadianNadir ? new Date(p.circadianNadir) : null,
    sleepArchitectureScore: p.sleepArchitectureScore,
  };
}
