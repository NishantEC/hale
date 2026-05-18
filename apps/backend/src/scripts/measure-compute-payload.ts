/**
 * Task 0 gate for the compute-engine Rust port: measure real serialized
 * payload sizes for one user's 45-day window, both Phase 1 (per-day) and
 * Phase 2 (batch) shapes. Cloud Run caps request bodies at 32 MiB; this
 * verifies we have at least 2x headroom before the project commits to
 * JSON-over-HTTPS as the protocol.
 *
 * Usage:
 *   PGPASSWORD=... DB_USER=noop DB_NAME=noop \
 *     npx tsx apps/backend/src/scripts/measure-compute-payload.ts <userId>
 *
 * Output: JSON array with [phase1-day, phase2-batch] entries, each
 * including rawMiB + gzipMiB.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { gzipSync } from 'zlib';

async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error('usage: measure-compute-payload <userId>');
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
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const [samples, sensorRecords, nightFeatures, sleepDetections, sleepStages, journalEntries, baseline] = await Promise.all([
    ds.query('SELECT * FROM signal_samples WHERE "userId"=$1 AND "timestamp" >= $2', [userId, since]),
    ds.query('SELECT * FROM raw_sensor_records WHERE "userId"=$1 AND "timestamp" >= $2', [userId, since]),
    ds.query('SELECT * FROM night_features WHERE "userId"=$1 AND "nightDate" >= $2', [userId, since]),
    ds.query('SELECT * FROM sleep_detections WHERE "userId"=$1 AND "nightDate" >= $2', [userId, since]),
    ds.query('SELECT * FROM sleep_stages WHERE "userId"=$1 AND "nightDate" >= $2', [userId, since]),
    ds.query('SELECT * FROM journal_entries WHERE "userId"=$1 AND "timestamp" >= $2', [userId, since]).catch(() => []),
    ds.query('SELECT * FROM baseline_profiles WHERE "userId"=$1 LIMIT 1', [userId]),
  ]);
  const phase1Payload = {
    schemaVersion: 1, samples, sensorRecords, nightFeatures, sleepDetections,
    baseline: baseline[0] ?? null,
    referenceDate: new Date().toISOString().slice(0, 10),
    timeZone: 'Asia/Kolkata',
  };
  const phase2Payload = {
    schemaVersion: 1, samples, sensorRecords, nightFeatures, sleepDetections, sleepStages,
    baseline: baseline[0] ?? null, journalEntries, targetSleepMinutes: 480,
    dayDates: Array.from({ length: 45 }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)),
    timeZone: 'Asia/Kolkata',
  };
  const measure = (label: string, p: unknown) => {
    const raw = Buffer.from(JSON.stringify(p));
    const gz = gzipSync(raw, { level: 6 });
    return {
      label,
      samples: samples.length,
      sensorRecords: sensorRecords.length,
      sleepStages: sleepStages.length,
      rawMiB: +(raw.length / 1024 / 1024).toFixed(2),
      gzipMiB: +(gz.length / 1024 / 1024).toFixed(2),
    };
  };
  console.log(JSON.stringify([measure('phase1-day', phase1Payload), measure('phase2-batch', phase2Payload)], null, 2));
  await ds.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
