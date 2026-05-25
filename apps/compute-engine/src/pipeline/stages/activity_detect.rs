//! Activity detection as a WindowStage. Depends on SleepDetect — the
//! algorithm filters out sleep windows before segmenting bouts, so the
//! input fingerprint folds the upstream SleepDetect output revision.
//!
//! Writes `activity_detections` rows transactionally inside the
//! conductor's transaction. DELETE-then-INSERT scoped to `source IN
//! ('detected','candidate')` and the window's startTime range so any
//! user-confirmed bouts (different source value) survive.

use anyhow::Context;
use chrono::{DateTime, Utc};
use sqlx::{Postgres, Transaction};
use std::future::Future;
use std::pin::Pin;

use crate::math::activity_detect::{
    self, ActivityBout, ActivityRecord, BaselineProfile, OffWristIntervalLite, OffWristSource,
    SleepWindow,
};
use crate::math::sleep_detect;
use crate::pipeline::context::WindowContext;
use crate::pipeline::stage::WindowStage;
use crate::pipeline::types::{StageName, StageOutcome};

pub struct ActivityDetectStage;

impl WindowStage for ActivityDetectStage {
    fn name(&self) -> StageName {
        StageName::ActivityDetect
    }

    fn dependencies(&self) -> &'static [StageName] {
        &[StageName::SleepDetect]
    }

    fn run<'a>(
        &'a self,
        tx: &'a mut Transaction<'_, Postgres>,
        ctx: &'a WindowContext<'a>,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<StageOutcome>> + Send + 'a>> {
        Box::pin(async move {
            let records = fetch_activity_records(ctx.pool, ctx.user_id, ctx.since).await?;
            let sleep = fetch_sleep_windows(ctx.pool, ctx.user_id, ctx.since).await?;
            let baseline = fetch_baseline(ctx.pool, ctx.user_id).await?;
            let events = fetch_wrist_events(ctx.pool, ctx.user_id, ctx.since).await?;
            let off_wrist = build_off_wrist(&events, ctx.window_end);
            let bouts = activity_detect::detect_activities(&records, &sleep, baseline, &off_wrist);
            let written = write_bouts(tx, ctx.user_id, &bouts).await?;
            Ok(StageOutcome {
                rows_written: written as u64,
                stats: serde_json::json!({
                    "bouts": bouts.len(),
                    "raw_records": records.len(),
                    "sleep_windows": sleep.len(),
                    "off_wrist_intervals": off_wrist.len(),
                }),
            })
        })
    }
}

type ActivityRow = (
    DateTime<Utc>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
);

async fn fetch_activity_records(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<ActivityRecord>> {
    let rows: Vec<ActivityRow> = sqlx::query_as(
        r#"
        SELECT "timestamp", "heartRate", "gravityX", "gravityY", "gravityZ"
        FROM raw_sensor_records
        WHERE "userId" = $1 AND "timestamp" >= $2
        ORDER BY "timestamp" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch raw_sensor_records for activity_detect stage")?;
    Ok(rows
        .into_iter()
        .map(|(ts, hr, gx, gy, gz)| ActivityRecord {
            timestamp: ts,
            heart_rate: hr.unwrap_or(0.0),
            gravity_x: gx,
            gravity_y: gy,
            gravity_z: gz,
        })
        .collect())
}

async fn fetch_sleep_windows(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<SleepWindow>> {
    let rows: Vec<(DateTime<Utc>, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT "bedtime", "wakeTime"
        FROM sleep_detections
        WHERE "userId" = $1 AND "wakeTime" >= $2
        ORDER BY "bedtime" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch sleep_detections for activity_detect stage")?;
    Ok(rows
        .into_iter()
        .map(|(bedtime, wake_time)| SleepWindow { bedtime, wake_time })
        .collect())
}

async fn fetch_baseline(pool: &sqlx::PgPool, user_id: &str) -> anyhow::Result<BaselineProfile> {
    let row: Option<(f64, Option<f64>)> = sqlx::query_as(
        r#"
        SELECT "restingHeartRate", "maxHeartRate"
        FROM baseline_profiles
        WHERE "userId" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .context("fetch baseline_profiles for activity_detect stage")?;
    Ok(row
        .map(|(resting, max)| BaselineProfile {
            resting_hr: resting,
            max_hr: max,
        })
        .unwrap_or(BaselineProfile {
            resting_hr: 0.0,
            max_hr: None,
        }))
}

async fn fetch_wrist_events(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<(i32, DateTime<Utc>)>> {
    let rows: Vec<(i32, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT "eventNumber"::int, "capturedAt"
        FROM device_events
        WHERE "userId" = $1
          AND "capturedAt" >= $2
          AND "eventNumber" IN (7, 8, 9, 10)
        ORDER BY "capturedAt" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch device_events for activity_detect stage")?;
    Ok(rows)
}

fn build_off_wrist(
    events: &[(i32, DateTime<Utc>)],
    window_end: DateTime<Utc>,
) -> Vec<OffWristIntervalLite> {
    // Reuse the sleep_detect helper to compute interval start/end pairs;
    // then attach a source label based on the event number.
    let intervals = sleep_detect::build_off_wrist_intervals(events, window_end);
    intervals
        .into_iter()
        .map(|i| {
            // The first event in `events` whose timestamp matches this
            // interval's start picks the source label. 7/9 = WristOff,
            // 8/10 = ChargingOn (matches openWhoop reverse-engineering).
            let source = events
                .iter()
                .find(|(_, ts)| *ts == i.start)
                .and_then(|(n, _)| match n {
                    7 | 9 => Some(OffWristSource::WristOff),
                    8 | 10 => Some(OffWristSource::ChargingOn),
                    _ => None,
                });
            OffWristIntervalLite {
                start: i.start,
                end: i.end,
                source,
            }
        })
        .collect()
}

async fn write_bouts(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    bouts: &[ActivityBout],
) -> anyhow::Result<usize> {
    if bouts.is_empty() {
        return Ok(0);
    }
    let first = bouts.first().unwrap().start_time;
    let last = bouts.last().unwrap().end_time;
    sqlx::query(
        r#"
        DELETE FROM activity_detections
        WHERE "userId" = $1
          AND "source" IN ('detected', 'candidate')
          AND "startTime" >= $2
          AND "startTime" <= $3
        "#,
    )
    .bind(user_id)
    .bind(first)
    .bind(last)
    .execute(&mut **tx)
    .await
    .context("DELETE old activity_detections")?;

    let mut written = 0usize;
    for b in bouts {
        sqlx::query(
            r#"
            INSERT INTO activity_detections (
                "userId",
                "startTime",
                "endTime",
                "durationMinutes",
                "activityType",
                "intensity",
                "confidence",
                "heartRateAvg",
                "heartRateMax",
                "strainScore",
                "cadenceHz",
                "externalSource",
                "source",
                "updatedAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            "#,
        )
        .bind(user_id)
        .bind(b.start_time)
        .bind(b.end_time)
        .bind(b.duration_minutes)
        .bind(&b.activity_type)
        .bind(b.intensity.as_str())
        .bind(b.confidence)
        .bind(b.heart_rate_avg)
        .bind(b.heart_rate_max)
        .bind(b.strain_score)
        .bind(b.cadence_hz)
        .bind(b.external_source.as_deref())
        .bind(b.source.as_str())
        .execute(&mut **tx)
        .await
        .context("INSERT activity_detections row")?;
        written += 1;
    }
    Ok(written)
}
