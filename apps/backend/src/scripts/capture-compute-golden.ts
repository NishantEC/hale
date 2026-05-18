/**
 * Task 3 of the compute-engine plan: capture an anonymized golden
 * fixture for one user + one reference date, by running the JS
 * compute path and committing both input and expected output to the
 * .fixtures/compute-engine-golden directory.
 *
 * Usage:
 *   PGPASSWORD=... DB_USER=noop DB_NAME=noop \
 *     npx tsx apps/backend/src/scripts/capture-compute-golden.ts <userId> <YYYY-MM-DD> <tag> [tz]
 *
 * Anonymization: all timestamps are shifted so the reference day starts
 * at 2026-01-01T00:00:00Z. userId / id columns are stripped. The
 * deterministic user hash is logged for traceability.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { computeDerivedMetrics, precomputeMetricSeries } from '../processing/derived-metrics';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const FIXTURE_DIR = join(__dirname, '../../.fixtures/compute-engine-golden');
const EPOCH = new Date('2026-01-01T00:00:00.000Z').getTime();

async function main() {
  const [userId, day, tag, tzArg] = process.argv.slice(2);
  if (!userId || !day || !tag) {
    throw new Error('usage: capture-compute-golden <userId> <YYYY-MM-DD> <tag> [tz]');
  }
  const timeZone = tzArg ?? 'Asia/Kolkata';

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '5433', 10),
    username: process.env.DB_USER ?? 'noop',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? 'noop',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();

  // 8 days back, 1 day forward — enough for the 7-day rolling windows.
  const dayDate = new Date(`${day}T00:00:00Z`);
  const since = new Date(dayDate.getTime() - 8 * 86400000);
  const until = new Date(dayDate.getTime() + 1 * 86400000);

  const [samples, sensorRecords, nightFeatures, sleepDetections, baseline] = await Promise.all([
    ds.query(
      'SELECT * FROM signal_samples WHERE "userId"=$1 AND "timestamp" >= $2 AND "timestamp" < $3 ORDER BY "timestamp"',
      [userId, since, until],
    ),
    ds.query(
      'SELECT * FROM raw_sensor_records WHERE "userId"=$1 AND "timestamp" >= $2 AND "timestamp" < $3 ORDER BY "timestamp"',
      [userId, since, until],
    ),
    ds.query(
      'SELECT * FROM night_features WHERE "userId"=$1 AND "nightDate" >= $2 AND "nightDate" < $3 ORDER BY "nightDate"',
      [userId, since, until],
    ),
    ds.query(
      'SELECT * FROM sleep_detections WHERE "userId"=$1 AND "nightDate" >= $2 AND "nightDate" < $3 ORDER BY "nightDate"',
      [userId, since, until],
    ),
    ds.query('SELECT * FROM baseline_profiles WHERE "userId"=$1 LIMIT 1', [userId]),
  ]);

  const shiftMs = EPOCH - dayDate.getTime();
  const userHash = `user_${createHash('sha256').update(userId).digest('hex').slice(0, 8)}`;

  const shiftTs = <T extends Record<string, any>>(row: T): any => {
    const out: any = { ...row };
    for (const k of ['timestamp', 'nightDate', 'bedtime', 'wakeTime']) {
      if (out[k]) {
        out[k] = new Date(new Date(out[k]).getTime() + shiftMs).toISOString();
      }
    }
    delete out.userId;
    delete out.id;
    return out;
  };

  const anonSamples = samples.map(shiftTs);
  const anonSensor = sensorRecords.map(shiftTs);
  const anonFeatures = nightFeatures.map(shiftTs);
  const anonDetections = sleepDetections.map(shiftTs);
  const anonBaseline = baseline[0]
    ? (({ userId: _u, id: _i, ...rest }: any) => rest)(baseline[0])
    : null;

  const shiftedDay = new Date(EPOCH).toISOString().slice(0, 10);

  // Build Date-typed inputs for the JS call (the SQL queries return strings
  // for some timestamptz columns under tsx; normalize).
  const samplesD = anonSamples.map((s: any) => ({
    timestamp: new Date(s.timestamp),
    source: s.source,
    heartRate: Number(s.heartRate ?? 0),
    ibiMs: s.ibiMs == null ? null : Number(s.ibiMs),
    motionScore: s.motionScore == null ? null : Number(s.motionScore),
    qualityScore: Number(s.qualityScore ?? 0),
  }));
  const sensorD = anonSensor.map((s: any) => ({
    timestamp: new Date(s.timestamp),
    heartRate: Number(s.heartRate ?? 0),
    rrAverageMs: s.rrAverageMs == null ? null : Number(s.rrAverageMs),
    spo2Red: s.spo2Red == null ? null : Number(s.spo2Red),
    spo2IR: s.spo2IR == null ? null : Number(s.spo2IR),
    skinTempRaw: s.skinTempRaw == null ? null : Number(s.skinTempRaw),
    gravityMagnitude: s.gravityMagnitude == null ? null : Number(s.gravityMagnitude),
    gravityX: s.gravityX == null ? null : Number(s.gravityX),
    gravityY: s.gravityY == null ? null : Number(s.gravityY),
    gravityZ: s.gravityZ == null ? null : Number(s.gravityZ),
    respRateRaw: s.respRateRaw == null ? null : Number(s.respRateRaw),
    skinContact: s.skinContact == null ? null : Boolean(s.skinContact),
    ppgGreen: s.ppgGreen == null ? null : Number(s.ppgGreen),
    ppgRedIr: s.ppgRedIr == null ? null : Number(s.ppgRedIr),
    ambientLight: s.ambientLight == null ? null : Number(s.ambientLight),
    ledDrive1: s.ledDrive1 == null ? null : Number(s.ledDrive1),
    ledDrive2: s.ledDrive2 == null ? null : Number(s.ledDrive2),
    signalQuality: s.signalQuality == null ? null : Number(s.signalQuality),
  }));
  const featuresD = anonFeatures.map((f: any) => ({
    nightDate: new Date(f.nightDate),
    restingHeartRate: Number(f.restingHeartRate ?? 0),
    rmssd: Number(f.rmssd ?? 0),
    sdnn: Number(f.sdnn ?? 0),
    pnn50: Number(f.pnn50 ?? 0),
    respiratoryRate: Number(f.respiratoryRate ?? 0),
    continuity: Number(f.continuity ?? 0),
    regularity: Number(f.regularity ?? 0),
    validCoverage: Number(f.validCoverage ?? 0),
    confidenceRaw: Number(f.confidenceRaw ?? 0),
    sleepEstimateHours: Number(f.sleepEstimateHours ?? 0),
    sourceBlend: f.sourceBlend ?? '',
  }));
  const detD = anonDetections.map((d: any) => ({
    nightDate: new Date(d.nightDate),
    bedtime: new Date(d.bedtime),
    wakeTime: new Date(d.wakeTime),
    durationHours: Number(d.durationHours ?? 0),
    interruptionCount: Number(d.interruptionCount ?? 0),
    continuity: Number(d.continuity ?? 0),
    regularity: Number(d.regularity ?? 0),
    validCoverage: Number(d.validCoverage ?? 0),
    confidence: Number(d.confidence ?? 0),
  }));
  const baselineForJs = anonBaseline
    ? {
        restingHeartRate: Number(anonBaseline.restingHeartRate ?? 0),
        rmssd: Number(anonBaseline.rmssd ?? 0),
        sdnn: Number(anonBaseline.sdnn ?? 0),
        nightsUsed: Number(anonBaseline.nightsUsed ?? 0),
        isWarmedUp: Number(anonBaseline.nightsUsed ?? 0) >= 5,
        maxHeartRate: anonBaseline.maxHeartRate == null ? null : Number(anonBaseline.maxHeartRate),
      }
    : {
        restingHeartRate: 0,
        rmssd: 0,
        sdnn: 0,
        nightsUsed: 0,
        isWarmedUp: false,
        maxHeartRate: null,
      };

  const precomputed = precomputeMetricSeries(samplesD, sensorD);
  const expected = computeDerivedMetrics(
    samplesD, sensorD, featuresD, detD, baselineForJs,
    new Date(`${shiftedDay}T00:00:00Z`),
    timeZone,
    precomputed,
  );

  // Sanitize anonymized inputs once more before writing — null any
  // free-text journal-style fields we don't want fixtures to carry.
  // The fixture payload schema is locked to ComputeDerivedMetricsDayRequestV1
  // shape (Task 2).
  const fixture = {
    description: tag,
    capturedAt: new Date().toISOString(),
    sourceUserHash: userHash,
    input: {
      schemaVersion: 1,
      samples: samplesD.map((s) => ({ ...s, timestamp: s.timestamp.toISOString() })),
      sensorRecords: sensorD.map((s) => ({ ...s, timestamp: s.timestamp.toISOString() })),
      nightFeatures: featuresD.map((f) => ({ ...f, nightDate: f.nightDate.toISOString() })),
      sleepDetections: detD.map((d) => ({
        ...d,
        nightDate: d.nightDate.toISOString(),
        bedtime: d.bedtime.toISOString(),
        wakeTime: d.wakeTime.toISOString(),
      })),
      baseline: baselineForJs,
      referenceDate: shiftedDay,
      timeZone,
    },
    expected: {
      schemaVersion: 1,
      strainScore: expected.strainScore,
      sleepConsistencyScore: expected.sleepConsistencyScore,
      detectedSleepNights: expected.detectedSleepNights,
      skinTempAvgCelsius: expected.skinTempAvgCelsius,
      skinTempDeltaCelsius: expected.skinTempDeltaCelsius,
      stressAverage: expected.stressAverage,
      spo2Average: expected.spo2Average,
      lfHfRatioAverage: expected.lfHfRatioAverage,
      recoveryIndex: expected.recoveryIndex,
      trainingLoadRatio: expected.trainingLoadRatio,
      trainingLoadRiskZone: expected.trainingLoadRiskZone,
      spo2DipCount: expected.spo2DipCount,
      odiPerHour: expected.odiPerHour,
      lowestSpo2: expected.lowestSpo2,
      coreTemperatureEstimate: expected.coreTemperatureEstimate,
      circadianNadir: expected.circadianNadir ? expected.circadianNadir.toISOString() : null,
      sleepArchitectureScore: expected.sleepArchitectureScore,
    },
  };

  if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
  const path = join(FIXTURE_DIR, `${tag}.json`);
  writeFileSync(path, JSON.stringify(fixture, null, 2));
  console.log(`wrote ${path} — userHash=${userHash} samples=${samplesD.length} sensorRecords=${sensorD.length} strain=${expected.strainScore}`);

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
