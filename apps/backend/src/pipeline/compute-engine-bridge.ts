import type {
  SignalSample,
  HistoricalSensorRecord,
  NightFeatureSet,
  SleepDetectionSummary,
  BaselineProfile,
  DerivedMetricsBundle,
} from '../processing/interfaces.js';
import type {
  ActivityBout,
  ActivityType,
} from '../processing/activity-detector.js';
import type {
  ComputeBatchRequestV1,
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
      // Gravity needed for activity-bout segmentation on the Rust side.
      // Null when the strap was off-wrist; the Rust detector treats nulls
      // as motion (faithful to the openwhoop reference).
      gravityX: r.gravityX,
      gravityY: r.gravityY,
      gravityZ: r.gravityZ,
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

interface BuildBatchArgs {
  samples: SignalSample[];
  sensorRecords: HistoricalSensorRecord[];
  effectiveFeatures: NightFeatureSet[];
  sleepDetections: SleepDetectionSummary[];
  baseline: BaselineProfile;
  dayDates: Date[];
  timeZone: string;
}

/**
 * Build ONE request body covering every reference day in the pipeline run.
 * Rust loops days internally, so the heavy JSON.stringify + Buffer.from +
 * gzipSync allocation happens once per pipeline run instead of once per day.
 * That's the change that pulls peak Node heap from ~3 GiB (per-day Phase 1)
 * back to under 1 GiB on the heaviest user.
 */
export function buildBatchRequest(
  args: BuildBatchArgs,
): ComputeBatchRequestV1 {
  const samples = args.samples.map((s) => ({
    timestamp: toIso(s.timestamp),
    heartRate: s.heartRate,
    ibiMs: s.ibiMs,
  }));
  const sensorRecords = args.sensorRecords
    .filter(
      (r) => r.spo2Red != null && r.spo2IR != null && r.skinTempRaw != null,
    )
    .map((r) => ({
      timestamp: toIso(r.timestamp),
      heartRate: r.heartRate,
      spo2Red: r.spo2Red,
      spo2IR: r.spo2IR,
      skinTempRaw: r.skinTempRaw,
      gravityX: r.gravityX,
      gravityY: r.gravityY,
      gravityZ: r.gravityZ,
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
    dayDates: args.dayDates.map((d) => d.toISOString().slice(0, 10)),
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

/**
 * Convert Rust-shaped ActivityBoutV1 entries into the TS ActivityBout shape
 * used by the rest of the pipeline (persistence, HealthKit reclassifiers).
 * The two shapes are aligned by field name; this mostly handles the
 * Date↔string conversion and the optional fields.
 */
export function liftActivityBouts(
  p: PersistedDailyMetricV1,
): (ActivityBout & { source: 'detected' | 'candidate' })[] {
  return p.activityBouts.map((b) => ({
    startTime: new Date(b.startTime),
    endTime: new Date(b.endTime),
    durationMinutes: b.durationMinutes,
    activityType: b.activityType as ActivityType,
    intensity: b.intensity as 'light' | 'moderate' | 'hard',
    confidence: b.confidence,
    heartRateAvg: b.heartRateAvg,
    heartRateMax: b.heartRateMax,
    strainScore: b.strainScore,
    cadenceHz: b.cadenceHz,
    flightsCount: b.flightsCount,
    elevationGainMeters: b.elevationGainMeters,
    distanceMeters: b.distanceMeters,
    externalSource: b.externalSource,
    source: (b.source === 'candidate' ? 'candidate' : 'detected') as
      | 'detected'
      | 'candidate',
  }));
}
