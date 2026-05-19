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
  return {
    schemaVersion: 1,
    samples: args.samples.map((s) => ({
      ...s,
      timestamp: toIso(s.timestamp),
    })) as any,
    sensorRecords: args.sensorRecords.map((s) => ({
      ...s,
      timestamp: toIso(s.timestamp),
    })) as any,
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
