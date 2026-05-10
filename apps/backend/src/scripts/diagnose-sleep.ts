/**
 * One-shot diagnostic — pulls last-24h activity, prints coverage stats,
 * re-runs the pipeline, and prints the resulting sleep detection.
 *
 * Run as a Cloud Run Job:
 *   gcloud run jobs deploy noop-diagnose-sleep \
 *     --image=us-central1-docker.pkg.dev/flashckard/noop/backend:<SHA> \
 *     --command=node \
 *     --args=apps/backend/dist/scripts/diagnose-sleep.js \
 *     ...
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../app.module.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const ds = app.get(DataSource);
  const pipeline = app.get(PipelineService);

  // 1. Active users (any raw_sensor_records in last 36h)
  const userRows: Array<{
    userId: string;
    cnt: string;
    min_ts: Date;
    max_ts: Date;
  }> = await ds.query(`
    SELECT "userId",
           COUNT(*)::text AS cnt,
           MIN(timestamp) AS min_ts,
           MAX(timestamp) AS max_ts
    FROM raw_sensor_records
    WHERE timestamp >= NOW() - INTERVAL '36 hours'
    GROUP BY "userId"
    ORDER BY COUNT(*) DESC
  `);
  console.log('\n=== ACTIVE USERS (last 36h) ===');
  console.log(JSON.stringify(userRows, null, 2));

  if (userRows.length === 0) {
    console.log('No active users — exiting.');
    await app.close();
    return;
  }
  const userId = userRows[0].userId;
  console.log(`\n>>> Diagnosing user: ${userId}`);

  // 2. Hourly raw record coverage
  const coverage: Array<{
    hour: Date;
    samples: string;
    hr_samples: string;
    avg_hr: number | null;
    motion_pct: number | null;
  }> = await ds.query(
    `
    SELECT
      DATE_TRUNC('hour', timestamp) AS hour,
      COUNT(*)::text                    AS samples,
      COUNT(*) FILTER (WHERE "heartRate" > 0)::text AS hr_samples,
      AVG("heartRate") FILTER (WHERE "heartRate" > 0)::numeric(10,1) AS avg_hr,
      ROUND(
        COUNT(*) FILTER (WHERE "skinContact" = true)::numeric * 100
        / GREATEST(COUNT(*), 1),
        1
      ) AS motion_pct
    FROM raw_sensor_records
    WHERE "userId" = $1
      AND timestamp >= NOW() - INTERVAL '36 hours'
    GROUP BY hour
    ORDER BY hour
    `,
    [userId],
  );
  console.log('\n=== HOURLY COVERAGE ===');
  console.log('(samples = total raw rows; hr_samples = with valid HR)');
  for (const r of coverage) {
    const expected = 14400; // ~4 samples/sec * 3600s = if 4Hz, but typically 1-4 samples/sec
    const pct =
      Math.min(100, (parseInt(r.samples, 10) / expected) * 100).toFixed(1);
    console.log(
      `  ${r.hour.toISOString()}  samples=${r.samples}  hr=${r.hr_samples}  avg_hr=${r.avg_hr ?? '--'}  contact=${r.motion_pct ?? '--'}%  (~${pct}% of 4Hz)`,
    );
  }

  // 3. Time gaps in sensor data (>5 min between consecutive rows)
  const gaps: Array<{ gap_start: Date; gap_end: Date; gap_minutes: number }> =
    await ds.query(
      `
      WITH ts AS (
        SELECT timestamp,
               LEAD(timestamp) OVER (ORDER BY timestamp) AS next_ts
        FROM raw_sensor_records
        WHERE "userId" = $1
          AND timestamp >= NOW() - INTERVAL '36 hours'
      )
      SELECT
        timestamp                                                    AS gap_start,
        next_ts                                                      AS gap_end,
        EXTRACT(EPOCH FROM (next_ts - timestamp))::numeric / 60       AS gap_minutes
      FROM ts
      WHERE next_ts IS NOT NULL
        AND EXTRACT(EPOCH FROM (next_ts - timestamp)) > 300
      ORDER BY timestamp
      `,
      [userId],
    );
  console.log('\n=== GAPS > 5min IN RAW STREAM ===');
  if (gaps.length === 0) {
    console.log('  (none — continuous coverage)');
  } else {
    for (const g of gaps) {
      console.log(
        `  ${g.gap_start.toISOString()} -> ${g.gap_end.toISOString()}  (${Number(g.gap_minutes).toFixed(1)} min)`,
      );
    }
  }

  // 4. Existing sleep detections (last 7 days)
  console.log('\n=== EXISTING SLEEP DETECTIONS (last 7 days) ===');
  const sleeps = await ds.query(
    `
    SELECT "nightDate", bedtime, "wakeTime",
           "durationHours", "interruptionCount",
           continuity, regularity, "validCoverage", confidence
    FROM sleep_detections
    WHERE "userId" = $1 AND "nightDate" >= NOW() - INTERVAL '7 days'
    ORDER BY "nightDate" DESC
    `,
    [userId],
  );
  console.log(JSON.stringify(sleeps, null, 2));

  console.log('\n=== EXISTING SLEEP STAGES (last 7 days) ===');
  const stages = await ds.query(
    `
    SELECT "nightDate", "remMinutes", "coreMinutes", "deepMinutes",
           "awakeMinutes", "unknownMinutes", confidence, source,
           "epochMinutes",
           jsonb_array_length(COALESCE("epochTimeline", '[]'::jsonb)) AS epoch_count
    FROM sleep_stages
    WHERE "userId" = $1 AND "nightDate" >= NOW() - INTERVAL '7 days'
    ORDER BY "nightDate" DESC
    `,
    [userId],
  );
  console.log(JSON.stringify(stages, null, 2));

  console.log('\n=== EXISTING NIGHT FEATURES (last 7 days) ===');
  const features = await ds.query(
    `
    SELECT "nightDate", "restingHeartRate", rmssd, sdnn, "respiratoryRate",
           continuity, regularity, "validCoverage", "confidenceRaw",
           "sleepEstimateHours", "sourceBlend"
    FROM night_features
    WHERE "userId" = $1 AND "nightDate" >= NOW() - INTERVAL '7 days'
    ORDER BY "nightDate" DESC
    `,
    [userId],
  );
  console.log(JSON.stringify(features, null, 2));

  // 5. HealthKit data for the same window
  console.log('\n=== HEALTHKIT DAILY SUMMARIES (last 7 days) ===');
  const hk = await ds.query(
    `
    SELECT "dayDate", steps, "activeEnergyKcal", "exerciseMinutes",
           "standMinutes", "walkingDistanceMeters", "flightsClimbed",
           "restingHeartRate", "hrvSdnnMs", "respiratoryRateAverage"
    FROM healthkit_daily_summaries
    WHERE "userId" = $1 AND "dayDate" >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY "dayDate" DESC
    `,
    [userId],
  );
  console.log(JSON.stringify(hk, null, 2));

  console.log('\n=== HEALTHKIT WORKOUTS (last 36h) ===');
  const hkw = await ds.query(
    `
    SELECT "activityName", "startTime", "endTime", "durationMinutes",
           "totalDistanceMeters", "totalEnergyKcal", "appleSource"
    FROM healthkit_workouts
    WHERE "userId" = $1 AND "startTime" >= NOW() - INTERVAL '36 hours'
    ORDER BY "startTime" DESC
    `,
    [userId],
  );
  console.log(JSON.stringify(hkw, null, 2));

  console.log('\n=== BAROMETER COVERAGE (last 36h) ===');
  const baro: Array<{ hour: Date; samples: string; alt_avg: number | null }> =
    await ds.query(
      `
      SELECT DATE_TRUNC('hour', timestamp) AS hour,
             COUNT(*)::text AS samples,
             AVG("relativeAltitudeMeters")::numeric(10,2) AS alt_avg
      FROM barometer_samples
      WHERE "userId" = $1 AND timestamp >= NOW() - INTERVAL '36 hours'
      GROUP BY hour ORDER BY hour
      `,
      [userId],
    );
  if (baro.length === 0) console.log('  (none)');
  for (const r of baro) {
    console.log(
      `  ${r.hour.toISOString()}  samples=${r.samples}  alt_avg=${r.alt_avg ?? '--'}m`,
    );
  }

  // 6. Activity detections
  console.log('\n=== ACTIVITY DETECTIONS (last 36h) ===');
  const acts = await ds.query(
    `
    SELECT "startTime", "endTime", "durationMinutes",
           "activityType", intensity, confidence,
           "heartRateAvg", "heartRateMax", "strainScore",
           "cadenceHz", "flightsCount", "elevationGainMeters",
           "distanceMeters", "externalSource"
    FROM activity_detections
    WHERE "userId" = $1 AND "startTime" >= NOW() - INTERVAL '36 hours'
    ORDER BY "startTime"
    `,
    [userId],
  );
  console.log(JSON.stringify(acts, null, 2));

  // 7. Re-run the pipeline
  console.log('\n=== RE-RUNNING PIPELINE ===');
  const t0 = Date.now();
  try {
    const result = await pipeline.runPipeline(userId);
    console.log(`Pipeline ran in ${Date.now() - t0}ms`);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Pipeline failed:', err);
  }

  // 8. Re-check sleep detections after re-run
  console.log('\n=== SLEEP DETECTIONS AFTER RE-RUN ===');
  const sleepsAfter = await ds.query(
    `
    SELECT "nightDate", bedtime, "wakeTime",
           "durationHours", "interruptionCount",
           continuity, regularity, "validCoverage", confidence
    FROM sleep_detections
    WHERE "userId" = $1 AND "nightDate" >= NOW() - INTERVAL '7 days'
    ORDER BY "nightDate" DESC
    `,
    [userId],
  );
  console.log(JSON.stringify(sleepsAfter, null, 2));

  console.log('\n=== SLEEP STAGES AFTER RE-RUN ===');
  const stagesAfter = await ds.query(
    `
    SELECT "nightDate", "remMinutes", "coreMinutes", "deepMinutes",
           "awakeMinutes", "unknownMinutes", confidence, source,
           jsonb_array_length(COALESCE("epochTimeline", '[]'::jsonb)) AS epoch_count
    FROM sleep_stages
    WHERE "userId" = $1 AND "nightDate" >= NOW() - INTERVAL '7 days'
    ORDER BY "nightDate" DESC
    `,
    [userId],
  );
  console.log(JSON.stringify(stagesAfter, null, 2));

  console.log('\n=== ACTIVITY DETECTIONS AFTER RE-RUN ===');
  const actsAfter = await ds.query(
    `
    SELECT "startTime", "endTime", "durationMinutes",
           "activityType", intensity, confidence,
           "flightsCount", "elevationGainMeters", "externalSource"
    FROM activity_detections
    WHERE "userId" = $1 AND "startTime" >= NOW() - INTERVAL '36 hours'
    ORDER BY "startTime"
    `,
    [userId],
  );
  console.log(JSON.stringify(actsAfter, null, 2));

  await app.close();
}

main().catch((e) => {
  console.error('Diagnose script failed:', e);
  process.exit(1);
});
