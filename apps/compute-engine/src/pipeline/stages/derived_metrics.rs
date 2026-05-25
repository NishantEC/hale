//! Derived metrics as a WindowStage. Runs after wellness so it can pick
//! up the latest night_features + baseline_profiles. Pulls all inputs
//! from DB and dispatches `compute_derived_metrics` per reference day,
//! then writes `daily_metrics` rows transactionally.
//!
//! Replaces the NestJS-driven `compute_engine_client.computeBatch` HTTP
//! round-trip. The same Rust algorithm runs; we just save the HTTP hop.

use anyhow::Context;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use sqlx::{Postgres, Transaction};
use std::collections::BTreeSet;
use std::future::Future;
use std::pin::Pin;

use crate::derived_metrics::compute_derived_metrics;
use crate::pipeline::context::WindowContext;
use crate::pipeline::stage::WindowStage;
use crate::pipeline::types::{StageName, StageOutcome};
use crate::types::{
    BaselineProfileV1, ComputeDerivedMetricsDayRequestV1, HistoricalSensorRecordV1,
    NightFeatureSetV1, PersistedDailyMetricV1, SignalSampleV1, SleepDetectionSummaryV1,
};

pub struct DerivedMetricsStage;

impl WindowStage for DerivedMetricsStage {
    fn name(&self) -> StageName {
        StageName::DailyMetrics
    }

    fn dependencies(&self) -> &'static [StageName] {
        &[StageName::NightFeatures]
    }

    fn run<'a>(
        &'a self,
        tx: &'a mut Transaction<'_, Postgres>,
        ctx: &'a WindowContext<'a>,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<StageOutcome>> + Send + 'a>> {
        Box::pin(async move {
            let samples = fetch_signal_samples(ctx.pool, ctx.user_id, ctx.since).await?;
            let sensor_records = fetch_sensor_records(ctx.pool, ctx.user_id, ctx.since).await?;
            let night_features = fetch_night_features(ctx.pool, ctx.user_id, ctx.since).await?;
            let sleep_detections = fetch_sleep_detections(ctx.pool, ctx.user_id, ctx.since).await?;
            let baseline = fetch_baseline(ctx.pool, ctx.user_id).await?;
            let tz = ctx.time_zone.parse::<Tz>().unwrap_or(chrono_tz::UTC);

            let reference_days =
                collect_reference_days(&sensor_records, &sleep_detections, &night_features, tz);
            if reference_days.is_empty() {
                return Ok(StageOutcome::default());
            }

            let mut written = 0usize;
            let mut day_dates_for_prune = Vec::new();
            for day in &reference_days {
                let day_start = day_to_utc_start(*day, tz);
                let req = ComputeDerivedMetricsDayRequestV1 {
                    schema_version: 1,
                    samples: samples.clone(),
                    sensor_records: sensor_records.clone(),
                    night_features: night_features.clone(),
                    sleep_detections: sleep_detections.clone(),
                    baseline: baseline.clone(),
                    reference_date: day.format("%Y-%m-%d").to_string(),
                    time_zone: ctx.time_zone.to_string(),
                };
                let metrics = compute_derived_metrics(&req)
                    .map_err(|e| anyhow::anyhow!("compute_derived_metrics for {day}: {e}"))?;
                write_daily_metrics(tx, ctx.user_id, day_start, &metrics).await?;
                day_dates_for_prune.push(day_start);
                written += 1;
            }

            Ok(StageOutcome {
                rows_written: written as u64,
                stats: serde_json::json!({
                    "days": written,
                    "samples": samples.len(),
                    "sensor_records": sensor_records.len(),
                }),
            })
        })
    }
}

fn collect_reference_days(
    sensor_records: &[HistoricalSensorRecordV1],
    sleep_detections: &[SleepDetectionSummaryV1],
    night_features: &[NightFeatureSetV1],
    tz: Tz,
) -> Vec<NaiveDate> {
    let mut days: BTreeSet<NaiveDate> = BTreeSet::new();
    for r in sensor_records {
        days.insert(r.timestamp.with_timezone(&tz).date_naive());
    }
    for d in sleep_detections {
        days.insert(d.night_date.with_timezone(&tz).date_naive());
    }
    for f in night_features {
        days.insert(f.night_date.with_timezone(&tz).date_naive());
    }
    days.into_iter().collect()
}

fn day_to_utc_start(day: NaiveDate, tz: Tz) -> DateTime<Utc> {
    let local_midnight = day.and_hms_opt(0, 0, 0).unwrap();
    tz.from_local_datetime(&local_midnight)
        .single()
        .or_else(|| tz.from_local_datetime(&local_midnight).earliest())
        .unwrap()
        .with_timezone(&Utc)
}

type SignalRow = (
    DateTime<Utc>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
);

async fn fetch_signal_samples(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<SignalSampleV1>> {
    let rows: Vec<SignalRow> = sqlx::query_as(
        r#"
        SELECT "timestamp", "heartRate", "ibiMs", "motionScore", "qualityScore"
        FROM signal_samples
        WHERE "userId" = $1 AND "timestamp" >= $2
        ORDER BY "timestamp" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch signal_samples for derived_metrics stage")?;
    Ok(rows
        .into_iter()
        .map(|(ts, hr, ibi, motion, quality)| SignalSampleV1 {
            timestamp: ts,
            heart_rate: hr.unwrap_or(0.0),
            ibi_ms: ibi,
            source: "strap".to_string(),
            motion_score: motion,
            quality_score: quality.unwrap_or(0.0),
        })
        .collect())
}

#[derive(sqlx::FromRow)]
struct SensorRow {
    timestamp: DateTime<Utc>,
    #[sqlx(rename = "heartRate")]
    heart_rate: Option<f64>,
    #[sqlx(rename = "rrAverageMs")]
    rr_average_ms: Option<f64>,
    #[sqlx(rename = "spo2Red")]
    spo2_red: Option<f64>,
    #[sqlx(rename = "spo2IR")]
    spo2_ir: Option<f64>,
    #[sqlx(rename = "skinTempRaw")]
    skin_temp_raw: Option<f64>,
    #[sqlx(rename = "gravityMagnitude")]
    gravity_magnitude: Option<f64>,
    #[sqlx(rename = "gravityX")]
    gravity_x: Option<f64>,
    #[sqlx(rename = "gravityY")]
    gravity_y: Option<f64>,
    #[sqlx(rename = "gravityZ")]
    gravity_z: Option<f64>,
    #[sqlx(rename = "respRateRaw")]
    resp_rate_raw: Option<f64>,
    #[sqlx(rename = "skinContact")]
    skin_contact: Option<bool>,
    #[sqlx(rename = "ppgGreen")]
    ppg_green: Option<f64>,
    #[sqlx(rename = "ppgRedIr")]
    ppg_red_ir: Option<f64>,
    #[sqlx(rename = "ambientLight")]
    ambient_light: Option<f64>,
    #[sqlx(rename = "ledDrive1")]
    led_drive1: Option<f64>,
    #[sqlx(rename = "ledDrive2")]
    led_drive2: Option<f64>,
    #[sqlx(rename = "signalQuality")]
    signal_quality: Option<f64>,
}

async fn fetch_sensor_records(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<HistoricalSensorRecordV1>> {
    let rows: Vec<SensorRow> = sqlx::query_as(
        r#"
        SELECT
            "timestamp","heartRate","rrAverageMs","spo2Red","spo2IR","skinTempRaw",
            "gravityMagnitude","gravityX","gravityY","gravityZ","respRateRaw",
            "skinContact","ppgGreen","ppgRedIr","ambientLight","ledDrive1",
            "ledDrive2","signalQuality"
        FROM raw_sensor_records
        WHERE "userId" = $1 AND "timestamp" >= $2
        ORDER BY "timestamp" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch raw_sensor_records for derived_metrics stage")?;
    Ok(rows
        .into_iter()
        .map(|t| HistoricalSensorRecordV1 {
            timestamp: t.timestamp,
            heart_rate: t.heart_rate.unwrap_or(0.0),
            rr_average_ms: t.rr_average_ms,
            spo2_red: t.spo2_red,
            spo2_ir: t.spo2_ir,
            skin_temp_raw: t.skin_temp_raw,
            gravity_magnitude: t.gravity_magnitude,
            gravity_x: t.gravity_x,
            gravity_y: t.gravity_y,
            gravity_z: t.gravity_z,
            resp_rate_raw: t.resp_rate_raw,
            skin_contact: t.skin_contact,
            ppg_green: t.ppg_green,
            ppg_red_ir: t.ppg_red_ir,
            ambient_light: t.ambient_light,
            led_drive1: t.led_drive1,
            led_drive2: t.led_drive2,
            signal_quality: t.signal_quality,
        })
        .collect())
}

type NFRow = (
    DateTime<Utc>,
    f64,
    f64,
    f64,
    Option<f64>,
    f64,
    f64,
    f64,
    f64,
    f64,
    f64,
    String,
);

async fn fetch_night_features(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<NightFeatureSetV1>> {
    let rows: Vec<NFRow> = sqlx::query_as(
        r#"
        SELECT "nightDate","restingHeartRate","rmssd","sdnn","pnn50",
               "respiratoryRate","continuity","regularity","validCoverage",
               "confidenceRaw","sleepEstimateHours","sourceBlend"
        FROM night_features
        WHERE "userId" = $1 AND "nightDate" >= $2
        ORDER BY "nightDate" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch night_features for derived_metrics stage")?;
    Ok(rows
        .into_iter()
        .map(|t| NightFeatureSetV1 {
            night_date: t.0,
            resting_heart_rate: t.1,
            rmssd: t.2,
            sdnn: t.3,
            pnn50: t.4.unwrap_or(0.0),
            respiratory_rate: t.5,
            continuity: t.6,
            regularity: t.7,
            valid_coverage: t.8,
            confidence_raw: t.9,
            sleep_estimate_hours: t.10,
            source_blend: t.11,
        })
        .collect())
}

type DetRow = (
    DateTime<Utc>,
    DateTime<Utc>,
    DateTime<Utc>,
    f64,
    i32,
    f64,
    f64,
    f64,
    f64,
);

async fn fetch_sleep_detections(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<SleepDetectionSummaryV1>> {
    let rows: Vec<DetRow> = sqlx::query_as(
        r#"
        SELECT "nightDate","bedtime","wakeTime","durationHours","interruptionCount",
               "continuity","regularity","validCoverage","confidence"
        FROM sleep_detections
        WHERE "userId" = $1 AND "wakeTime" >= $2
        ORDER BY "nightDate" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch sleep_detections for derived_metrics stage")?;
    Ok(rows
        .into_iter()
        .map(|t| SleepDetectionSummaryV1 {
            night_date: t.0,
            bedtime: t.1,
            wake_time: t.2,
            duration_hours: t.3,
            interruption_count: t.4 as f64,
            continuity: t.5,
            regularity: t.6,
            valid_coverage: t.7,
            confidence: t.8,
        })
        .collect())
}

async fn fetch_baseline(pool: &sqlx::PgPool, user_id: &str) -> anyhow::Result<BaselineProfileV1> {
    let row: Option<(f64, f64, f64, i32, Option<f64>)> = sqlx::query_as(
        r#"
        SELECT "restingHeartRate","rmssd","sdnn","nightsUsed","maxHeartRate"
        FROM baseline_profiles
        WHERE "userId" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .context("fetch baseline_profiles for derived_metrics stage")?;
    Ok(row
        .map(|(r, m, sd, n, mh)| BaselineProfileV1 {
            resting_heart_rate: r,
            rmssd: m,
            sdnn: sd,
            nights_used: n as f64,
            is_warmed_up: n >= 5,
            max_heart_rate: mh,
        })
        .unwrap_or(BaselineProfileV1 {
            resting_heart_rate: 0.0,
            rmssd: 0.0,
            sdnn: 0.0,
            nights_used: 0.0,
            is_warmed_up: false,
            max_heart_rate: None,
        }))
}

async fn write_daily_metrics(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    day_date: DateTime<Utc>,
    metrics: &PersistedDailyMetricV1,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        DELETE FROM daily_metrics
        WHERE "userId" = $1 AND "dayDate" = $2
        "#,
    )
    .bind(user_id)
    .bind(day_date)
    .execute(&mut **tx)
    .await
    .context("DELETE old daily_metrics row")?;

    sqlx::query(
        r#"
        INSERT INTO daily_metrics (
            "userId","dayDate","stressAverage","spo2Average","skinTempAvgCelsius",
            "skinTempDeltaCelsius","strainScore","sleepConsistencyScore",
            "detectedSleepNights","lfHfRatioAverage","recoveryIndex",
            "trainingLoadRatio","trainingLoadRiskZone","spo2DipCount","odiPerHour",
            "lowestSpo2","coreTemperatureEstimate","circadianNadir",
            "sleepArchitectureScore","updatedAt"
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
        "#,
    )
    .bind(user_id)
    .bind(day_date)
    .bind(metrics.stress_average)
    .bind(metrics.spo2_average)
    .bind(metrics.skin_temp_avg_celsius)
    .bind(metrics.skin_temp_delta_celsius)
    .bind(metrics.strain_score)
    .bind(metrics.sleep_consistency_score)
    .bind(metrics.detected_sleep_nights as i32)
    .bind(metrics.lf_hf_ratio_average)
    .bind(metrics.recovery_index)
    .bind(metrics.training_load_ratio)
    .bind(metrics.training_load_risk_zone.as_deref())
    .bind(metrics.spo2_dip_count.map(|v| v as i32))
    .bind(metrics.odi_per_hour)
    .bind(metrics.lowest_spo2)
    .bind(metrics.core_temperature_estimate)
    .bind(metrics.circadian_nadir)
    .bind(metrics.sleep_architecture_score)
    .execute(&mut **tx)
    .await
    .context("INSERT daily_metrics row")?;
    Ok(())
}
