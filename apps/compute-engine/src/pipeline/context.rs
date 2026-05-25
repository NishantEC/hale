//! Per-day data context built once and shared across all stages running
//! against that day. Stages borrow from this struct via `StageInput.context`
//! rather than re-querying the DB themselves — that's the single-scan
//! commitment of the new architecture.

use anyhow::Context;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use sqlx::PgPool;
use std::sync::Arc;

use crate::math::sleep_detect::{HistoricalRecord, OffWristInterval};
use crate::pipeline::types::DateWindow;

#[derive(Debug)]
pub struct DayContext {
    pub day: NaiveDate,
    pub window: DateWindow,
    pub records: Arc<[HistoricalRecord]>,
    pub off_wrist: Arc<[OffWristInterval]>,
    pub time_zone: Option<Tz>,
}

pub async fn fetch_day_context(
    pool: &PgPool,
    user_id: &str,
    time_zone: &str,
    day: NaiveDate,
    pad: chrono::Duration,
) -> anyhow::Result<DayContext> {
    let tz: Option<Tz> = time_zone.parse::<Tz>().ok();
    let window = day_to_window(day, tz, pad)?;
    let records = fetch_records(pool, user_id, window).await?;
    let events = fetch_wrist_events(pool, user_id, window).await?;
    let off_wrist = crate::math::sleep_detect::build_off_wrist_intervals(&events, window.end);
    Ok(DayContext {
        day,
        window,
        records: records.into(),
        off_wrist: off_wrist.into(),
        time_zone: tz,
    })
}

fn day_to_window(
    day: NaiveDate,
    tz: Option<Tz>,
    pad: chrono::Duration,
) -> anyhow::Result<DateWindow> {
    let local_midnight = day
        .and_hms_opt(0, 0, 0)
        .context("invalid day midnight construction")?;
    let start_local = match tz {
        Some(tz) => tz
            .from_local_datetime(&local_midnight)
            .single()
            .or_else(|| tz.from_local_datetime(&local_midnight).earliest())
            .context("ambiguous local midnight")?
            .with_timezone(&Utc),
        None => Utc.from_local_datetime(&local_midnight).unwrap(),
    };
    let end_local = start_local + chrono::Duration::days(1);
    Ok(DateWindow {
        start: start_local - pad,
        end: end_local + pad,
    })
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
    pool: &PgPool,
    user_id: &str,
    window: DateWindow,
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
          AND "timestamp" <  $3
        ORDER BY "timestamp" ASC
        "#,
    )
    .bind(user_id)
    .bind(window.start)
    .bind(window.end)
    .fetch_all(pool)
    .await
    .context("fetch raw_sensor_records for day context")?;
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
    pool: &PgPool,
    user_id: &str,
    window: DateWindow,
) -> anyhow::Result<Vec<(i32, DateTime<Utc>)>> {
    let rows: Vec<(i32, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT "eventNumber"::int, "capturedAt"
        FROM device_events
        WHERE "userId" = $1
          AND "capturedAt" >= $2
          AND "capturedAt" <  $3
          AND "eventNumber" IN (7, 8, 9, 10)
        ORDER BY "capturedAt" ASC
        "#,
    )
    .bind(user_id)
    .bind(window.start)
    .bind(window.end)
    .fetch_all(pool)
    .await
    .context("fetch device_events for day context")?;
    Ok(rows)
}
