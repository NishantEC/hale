//! Wellness stage — produces three downstream outputs in one pass:
//!   - `night_features` rows (one per sleep detection)
//!   - `baseline_profiles` row (one per user)
//!   - `daily_scores` rows (one per day's effective feature)
//!
//! Stage runs after sleep_detect; depends on sleep_detect's output
//! revision so the input fingerprint changes when sleep windows shift.
//! Gated behind WORKER_OWNS_WELLNESS (default off) so this ship is
//! zero behavior change in prod.

use anyhow::Context;
use chrono::{DateTime, Utc};
use sqlx::{Postgres, Transaction};
use std::future::Future;
use std::pin::Pin;

use crate::math::wellness_scoring::{
    self, BaselineProfile, NightFeatureBuildOptions, NightFeatureSet, SignalSample,
    SleepDetectionSummary,
};
use crate::pipeline::context::WindowContext;
use crate::pipeline::stage::WindowStage;
use crate::pipeline::types::{StageName, StageOutcome};

pub struct WellnessStage;

fn flag_enabled() -> bool {
    matches!(std::env::var("WORKER_OWNS_WELLNESS").as_deref(), Ok("true"))
}

const DEFAULT_TARGET_SLEEP_MINUTES: f64 = 8.0 * 60.0;

impl WindowStage for WellnessStage {
    fn name(&self) -> StageName {
        // Re-use NightFeatures as the canonical name; one row covers all
        // three outputs in this combined stage.
        StageName::NightFeatures
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
                    stats: serde_json::json!({ "skipped": "WORKER_OWNS_WELLNESS not set" }),
                });
            }
            let samples = fetch_signal_samples(ctx.pool, ctx.user_id, ctx.since).await?;
            let sanitized = wellness_scoring::sanitize_signal_samples(&samples);
            let detections = fetch_sleep_detections(ctx.pool, ctx.user_id, ctx.since).await?;
            if detections.is_empty() {
                return Ok(StageOutcome::default());
            }

            let prior_baseline =
                fetch_baseline(ctx.pool, ctx.user_id)
                    .await?
                    .unwrap_or(BaselineProfile {
                        resting_heart_rate: 0.0,
                        rmssd: 0.0,
                        sdnn: 0.0,
                        nights_used: 0,
                        is_warmed_up: false,
                        max_heart_rate: None,
                    });

            let mut effective = Vec::with_capacity(detections.len());
            for d in &detections {
                let opts = NightFeatureBuildOptions {
                    bedtime: Some(d.bedtime),
                    wake_time: Some(d.wake_time),
                    continuity: Some(d.continuity),
                    regularity: Some(d.regularity),
                    valid_coverage: Some(d.valid_coverage),
                    sleep_estimate_hours: Some(d.duration_hours),
                    respiratory_rate: None,
                };
                let base = wellness_scoring::build_night_feature_set(
                    &sanitized,
                    d.night_date,
                    prior_baseline,
                    opts,
                );
                let eff = wellness_scoring::effective_sleep_feature_set(&base, Some(d));
                effective.push(eff);
            }
            effective.sort_by_key(|f| f.night_date);
            let recomputed_baseline = wellness_scoring::recompute_baseline_profile(&effective);

            let daily_scores: Vec<wellness_scoring::DailyWellnessScore> = effective
                .iter()
                .map(|f| {
                    wellness_scoring::compute_daily_score(
                        f,
                        recomputed_baseline,
                        DEFAULT_TARGET_SLEEP_MINUTES,
                        &effective,
                    )
                })
                .collect();

            let nf_written = write_night_features(tx, ctx.user_id, &effective).await?;
            upsert_baseline(tx, ctx.user_id, recomputed_baseline).await?;
            let ds_written = write_daily_scores(tx, ctx.user_id, &daily_scores).await?;

            Ok(StageOutcome {
                rows_written: (nf_written + ds_written) as u64 + 1,
                stats: serde_json::json!({
                    "night_features": nf_written,
                    "daily_scores": ds_written,
                    "nights_used": recomputed_baseline.nights_used,
                    "is_warmed_up": recomputed_baseline.is_warmed_up,
                }),
            })
        })
    }
}

type SignalRow = (
    DateTime<Utc>,
    String,
    Option<f64>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
);

async fn fetch_signal_samples(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<SignalSample>> {
    let rows: Vec<SignalRow> = sqlx::query_as(
        r#"
            SELECT "timestamp", "source", "heartRate", "ibiMs", "motionScore", "qualityScore"
            FROM signal_samples
            WHERE "userId" = $1 AND "timestamp" >= $2
            ORDER BY "timestamp" ASC
            "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch signal_samples for wellness stage")?;
    Ok(rows
        .into_iter()
        .map(|(ts, source, hr, ibi, motion, quality)| SignalSample {
            timestamp: ts,
            source,
            heart_rate: hr.unwrap_or(0.0),
            ibi_ms: ibi,
            motion_score: motion,
            quality_score: quality.unwrap_or(0.0),
        })
        .collect())
}

type DetRow = (
    DateTime<Utc>,
    DateTime<Utc>,
    DateTime<Utc>,
    f64,
    f64,
    f64,
    f64,
    f64,
);

async fn fetch_sleep_detections(
    pool: &sqlx::PgPool,
    user_id: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<SleepDetectionSummary>> {
    let rows: Vec<DetRow> = sqlx::query_as(
        r#"
        SELECT "nightDate", "bedtime", "wakeTime", "durationHours", "continuity",
               "regularity", "validCoverage", "confidence"
        FROM sleep_detections
        WHERE "userId" = $1 AND "wakeTime" >= $2
        ORDER BY "nightDate" ASC
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("fetch sleep_detections for wellness stage")?;
    Ok(rows
        .into_iter()
        .map(|t| SleepDetectionSummary {
            night_date: t.0,
            bedtime: t.1,
            wake_time: t.2,
            duration_hours: t.3,
            continuity: t.4,
            regularity: t.5,
            valid_coverage: t.6,
            confidence: t.7,
        })
        .collect())
}

async fn fetch_baseline(
    pool: &sqlx::PgPool,
    user_id: &str,
) -> anyhow::Result<Option<BaselineProfile>> {
    let row: Option<(f64, f64, f64, i32, Option<f64>)> = sqlx::query_as(
        r#"
        SELECT "restingHeartRate", "rmssd", "sdnn", "nightsUsed", "maxHeartRate"
        FROM baseline_profiles
        WHERE "userId" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .context("fetch baseline_profiles for wellness stage")?;
    Ok(
        row.map(|(resting, rmssd, sdnn, nights, max_hr)| BaselineProfile {
            resting_heart_rate: resting,
            rmssd,
            sdnn,
            nights_used: nights,
            is_warmed_up: nights >= 5,
            max_heart_rate: max_hr,
        }),
    )
}

async fn write_night_features(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    features: &[NightFeatureSet],
) -> anyhow::Result<usize> {
    if features.is_empty() {
        return Ok(0);
    }
    let first = features.first().unwrap().night_date;
    let last = features.last().unwrap().night_date;
    sqlx::query(
        r#"
        DELETE FROM night_features
        WHERE "userId" = $1 AND "nightDate" >= $2 AND "nightDate" <= $3
        "#,
    )
    .bind(user_id)
    .bind(first)
    .bind(last)
    .execute(&mut **tx)
    .await
    .context("DELETE old night_features")?;

    let mut written = 0usize;
    for f in features {
        sqlx::query(
            r#"
            INSERT INTO night_features (
                "userId","nightDate","restingHeartRate","rmssd","sdnn","pnn50",
                "respiratoryRate","continuity","regularity","validCoverage",
                "confidenceRaw","sleepEstimateHours","sourceBlend","updatedAt"
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
            "#,
        )
        .bind(user_id)
        .bind(f.night_date)
        .bind(f.resting_heart_rate)
        .bind(f.rmssd)
        .bind(f.sdnn)
        .bind(f.pnn50)
        .bind(f.respiratory_rate)
        .bind(f.continuity)
        .bind(f.regularity)
        .bind(f.valid_coverage)
        .bind(f.confidence_raw)
        .bind(f.sleep_estimate_hours)
        .bind(&f.source_blend)
        .execute(&mut **tx)
        .await
        .context("INSERT night_features row")?;
        written += 1;
    }
    Ok(written)
}

async fn upsert_baseline(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    baseline: BaselineProfile,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO baseline_profiles (
            "userId","restingHeartRate","rmssd","sdnn","nightsUsed","maxHeartRate","updatedAt"
        )
        VALUES ($1,$2,$3,$4,$5,$6,NOW())
        ON CONFLICT ("userId") DO UPDATE
        SET "restingHeartRate" = EXCLUDED."restingHeartRate",
            "rmssd" = EXCLUDED."rmssd",
            "sdnn" = EXCLUDED."sdnn",
            "nightsUsed" = EXCLUDED."nightsUsed",
            "maxHeartRate" = EXCLUDED."maxHeartRate",
            "updatedAt" = NOW()
        "#,
    )
    .bind(user_id)
    .bind(baseline.resting_heart_rate)
    .bind(baseline.rmssd)
    .bind(baseline.sdnn)
    .bind(baseline.nights_used)
    .bind(baseline.max_heart_rate)
    .execute(&mut **tx)
    .await
    .context("UPSERT baseline_profiles row")?;
    Ok(())
}

async fn write_daily_scores(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    scores: &[wellness_scoring::DailyWellnessScore],
) -> anyhow::Result<usize> {
    if scores.is_empty() {
        return Ok(0);
    }
    let first = scores.first().unwrap().day_date;
    let last = scores.last().unwrap().day_date;
    sqlx::query(
        r#"
        DELETE FROM daily_scores
        WHERE "userId" = $1 AND "dayDate" >= $2 AND "dayDate" <= $3
        "#,
    )
    .bind(user_id)
    .bind(first)
    .bind(last)
    .execute(&mut **tx)
    .await
    .context("DELETE old daily_scores")?;

    let mut written = 0usize;
    for s in scores {
        sqlx::query(
            r#"
            INSERT INTO daily_scores (
                "userId","dayDate","dailyBalance","loadPressure","sleepReserveHours",
                "confidence","recommendation","detail","updatedAt"
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
            "#,
        )
        .bind(user_id)
        .bind(s.day_date)
        .bind(s.daily_balance)
        .bind(s.load_pressure)
        .bind(s.sleep_reserve_hours)
        .bind(s.confidence.as_str())
        .bind(s.recommendation.as_str())
        .bind(&s.detail)
        .execute(&mut **tx)
        .await
        .context("INSERT daily_scores row")?;
        written += 1;
    }
    Ok(written)
}
