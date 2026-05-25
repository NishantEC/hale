//! Sleep stages classifier as a WindowStage. Depends on SleepDetect so
//! the input fingerprint folds the upstream sleep_detect outputRevision.
//!
//! For each detection in the window, extract epoch features from raw
//! sensor records, classify with the quantile-prior algorithm, write
//! one `sleep_stages` row per night. DELETE-then-INSERT scoped to the
//! detection's nightDate range so existing rows get a fresh classify.

use anyhow::Context;
use chrono::{DateTime, Utc};
use sqlx::{Postgres, Transaction};
use std::future::Future;
use std::pin::Pin;

use crate::math::epoch_features::{self, EpochSensorRecord};
use crate::math::sleep_stages::{self, SleepDetectionInput, SleepStageSummary, StageEpoch};
use crate::pipeline::context::WindowContext;
use crate::pipeline::stage::WindowStage;
use crate::pipeline::types::{StageName, StageOutcome};

pub struct SleepStagesStage;

fn flag_enabled() -> bool {
    matches!(
        std::env::var("WORKER_OWNS_SLEEP_STAGES").as_deref(),
        Ok("true")
    )
}

impl WindowStage for SleepStagesStage {
    fn name(&self) -> StageName {
        StageName::SleepStages
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
            if !flag_enabled() {
                return Ok(StageOutcome {
                    rows_written: 0,
                    stats: serde_json::json!({ "skipped": "WORKER_OWNS_SLEEP_STAGES not set" }),
                });
            }
            let detections = fetch_detections(ctx.pool, ctx.user_id, ctx.since).await?;
            if detections.is_empty() {
                return Ok(StageOutcome::default());
            }
            let records = fetch_records(ctx.pool, ctx.user_id, ctx.since).await?;
            let night_median_hr = median_positive_hr(&records);

            let mut all_epochs = Vec::new();
            for d in &detections {
                let epochs = epoch_features::extract_epoch_features(
                    &records,
                    d.bedtime,
                    d.wake_time,
                    night_median_hr,
                    None,
                );
                all_epochs.extend(epochs);
            }
            let summaries = sleep_stages::classify_sleep_stages(&all_epochs, &detections);
            let written = write_summaries(tx, ctx.user_id, &summaries).await?;
            Ok(StageOutcome {
                rows_written: written as u64,
                stats: serde_json::json!({
                    "summaries": summaries.len(),
                    "detections": detections.len(),
                    "raw_records": records.len(),
                    "epochs": all_epochs.len(),
                }),
            })
        })
    }
}

type RawRow = (
    DateTime<Utc>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
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
) -> anyhow::Result<Vec<EpochSensorRecord>> {
    let rows: Vec<RawRow> = sqlx::query_as(
        r#"
        SELECT
            "timestamp",
            "heartRate",
            "rrAverageMs",
            "spo2Red",
            "spo2IR",
            "skinTempRaw",
            "gravityX",
            "gravityY",
            "gravityZ",
            "respRateRaw",
            "ambientLight",
            "ppgGreen",
            "signalQuality",
            "skinContact"
        FROM raw_sensor_records
        WHERE "userId" = $1 AND "timestamp" >= $2
        ORDER BY "timestamp" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch raw_sensor_records for sleep_stages stage")?;
    Ok(rows
        .into_iter()
        .map(|t| EpochSensorRecord {
            timestamp: t.0,
            heart_rate: t.1.unwrap_or(0.0),
            rr_average_ms: t.2,
            spo2_red: t.3,
            spo2_ir: t.4,
            skin_temp_raw: t.5,
            gravity_x: t.6,
            gravity_y: t.7,
            gravity_z: t.8,
            resp_rate_raw: t.9,
            ambient_light: t.10,
            ppg_green: t.11,
            signal_quality: t.12,
            skin_contact: t.13,
        })
        .collect())
}

type DetectionRow = (DateTime<Utc>, DateTime<Utc>, DateTime<Utc>, f64);

async fn fetch_detections(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<SleepDetectionInput>> {
    let rows: Vec<DetectionRow> = sqlx::query_as(
        r#"
        SELECT "nightDate", "bedtime", "wakeTime", "confidence"
        FROM sleep_detections
        WHERE "userId" = $1 AND "wakeTime" >= $2
        ORDER BY "nightDate" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch sleep_detections for sleep_stages stage")?;
    Ok(rows
        .into_iter()
        .map(
            |(night_date, bedtime, wake_time, confidence)| SleepDetectionInput {
                night_date,
                bedtime,
                wake_time,
                confidence,
            },
        )
        .collect())
}

fn median_positive_hr(records: &[EpochSensorRecord]) -> f64 {
    let mut hrs: Vec<f64> = records
        .iter()
        .map(|r| r.heart_rate)
        .filter(|v| *v > 0.0)
        .collect();
    if hrs.is_empty() {
        return 60.0;
    }
    hrs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    hrs[hrs.len() / 2]
}

fn timeline_to_json(timeline: &[StageEpoch]) -> serde_json::Value {
    let arr: Vec<serde_json::Value> = timeline
        .iter()
        .map(|c| {
            serde_json::json!({
                "timestamp": c.timestamp.to_rfc3339(),
                "stage": c.stage.as_str(),
            })
        })
        .collect();
    serde_json::Value::Array(arr)
}

async fn write_summaries(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    summaries: &[SleepStageSummary],
) -> anyhow::Result<usize> {
    if summaries.is_empty() {
        return Ok(0);
    }
    let first = summaries.first().unwrap().night_date;
    let last = summaries.last().unwrap().night_date;
    sqlx::query(
        r#"
        DELETE FROM sleep_stages
        WHERE "userId" = $1
          AND "nightDate" >= $2
          AND "nightDate" <= $3
        "#,
    )
    .bind(user_id)
    .bind(first)
    .bind(last)
    .execute(&mut **tx)
    .await
    .context("DELETE old sleep_stages")?;

    let mut written = 0usize;
    for s in summaries {
        let timeline = timeline_to_json(&s.epoch_timeline);
        sqlx::query(
            r#"
            INSERT INTO sleep_stages (
                "userId",
                "nightDate",
                "remMinutes",
                "coreMinutes",
                "deepMinutes",
                "awakeMinutes",
                "unknownMinutes",
                "confidence",
                "source",
                "epochTimeline",
                "epochMinutes",
                "updatedAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            "#,
        )
        .bind(user_id)
        .bind(s.night_date)
        .bind(s.rem_minutes)
        .bind(s.core_minutes)
        .bind(s.deep_minutes)
        .bind(s.awake_minutes)
        .bind(s.unknown_minutes)
        .bind(s.confidence)
        .bind(s.source)
        .bind(timeline)
        .bind(s.epoch_minutes)
        .execute(&mut **tx)
        .await
        .context("INSERT sleep_stages row")?;
        written += 1;
    }
    Ok(written)
}
