//! Sleep detection as a WindowStage. The algorithm in
//! `crate::math::sleep_detect` is inherently multi-day (cross-midnight
//! periods + regularity score across 7 nights), so this stage runs
//! once per pipeline run over the full window. Single-day stages
//! (activity_detect, sleep_stages once decomposed) will use `DayStage`.
//!
//! Writes `sleep_detections` rows transactionally inside the conductor's
//! transaction — stage data writes + ledger updates commit together.

use anyhow::Context;
use chrono::{DateTime, Utc};
use sqlx::{Postgres, Transaction};
use std::future::Future;
use std::pin::Pin;
use std::str::FromStr;

use crate::math::sleep_detect::{self, HistoricalRecord, SleepDetectionSummary};
use crate::pipeline::context::WindowContext;
use crate::pipeline::stage::WindowStage;
use crate::pipeline::types::{StageName, StageOutcome};

pub struct SleepDetectStage;

impl WindowStage for SleepDetectStage {
    fn name(&self) -> StageName {
        StageName::SleepDetect
    }

    fn run<'a>(
        &'a self,
        tx: &'a mut Transaction<'_, Postgres>,
        ctx: &'a WindowContext<'a>,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<StageOutcome>> + Send + 'a>> {
        Box::pin(async move {
            let records = fetch_records(ctx.pool, ctx.user_id, ctx.since).await?;
            let events = fetch_wrist_events(ctx.pool, ctx.user_id, ctx.since).await?;
            let off_wrist = sleep_detect::build_off_wrist_intervals(&events, ctx.window_end);
            let tz = chrono_tz::Tz::from_str(ctx.time_zone).ok();
            let detections = sleep_detect::detect(&records, tz, &off_wrist);
            let written =
                write_detections(tx, ctx.user_id, ctx.since, ctx.window_end, &detections).await?;
            Ok(StageOutcome {
                rows_written: written as u64,
                stats: serde_json::json!({
                    "detections": detections.len(),
                    "raw_records": records.len(),
                    "off_wrist_intervals": off_wrist.len(),
                }),
            })
        })
    }
}

type SleepRow = (
    DateTime<Utc>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<bool>,
);

async fn fetch_records(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<HistoricalRecord>> {
    let rows: Vec<SleepRow> = sqlx::query_as(
        r#"
        SELECT
            "timestamp",
            "heartRate",
            "gravityMagnitude",
            "gravityX",
            "gravityY",
            "gravityZ",
            "skinContact"
        FROM raw_sensor_records
        WHERE "userId" = $1
          AND "timestamp" >= $2
        ORDER BY "timestamp" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch raw_sensor_records for sleep_detect stage")?;
    Ok(rows
        .into_iter()
        .map(|(ts, hr, gm, gx, gy, gz, sc)| HistoricalRecord {
            timestamp: ts,
            heart_rate: hr.unwrap_or(0.0),
            gravity_magnitude: gm,
            gravity_x: gx,
            gravity_y: gy,
            gravity_z: gz,
            skin_contact: sc,
        })
        .collect())
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
    .context("fetch device_events for sleep_detect stage")?;
    Ok(rows)
}

async fn write_detections(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    since: DateTime<Utc>,
    window_end: DateTime<Utc>,
    detections: &[SleepDetectionSummary],
) -> anyhow::Result<usize> {
    let prune_end = window_end + chrono::Duration::days(1);
    sqlx::query(
        r#"
        DELETE FROM sleep_detections
        WHERE "userId" = $1
          AND "nightDate" >= $2
          AND "nightDate" <= $3
        "#,
    )
    .bind(user_id)
    .bind(since)
    .bind(prune_end)
    .execute(&mut **tx)
    .await
    .context("DELETE old sleep_detections")?;

    let mut written = 0usize;
    for d in detections {
        sqlx::query(
            r#"
            INSERT INTO sleep_detections (
                "userId",
                "nightDate",
                "bedtime",
                "wakeTime",
                "durationHours",
                "interruptionCount",
                "continuity",
                "regularity",
                "validCoverage",
                "confidence",
                "updatedAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            "#,
        )
        .bind(user_id)
        .bind(d.night_date)
        .bind(d.bedtime)
        .bind(d.wake_time)
        .bind(d.duration_hours)
        .bind(d.interruption_count)
        .bind(d.continuity)
        .bind(d.regularity)
        .bind(d.valid_coverage)
        .bind(d.confidence)
        .execute(&mut **tx)
        .await
        .context("INSERT sleep_detections row")?;
        written += 1;
    }
    Ok(written)
}
