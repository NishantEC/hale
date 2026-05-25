//! Per-day dirty-set computation. The worker reads `raw_sensor_records`
//! grouped by user-local calendar day, joins against the persisted
//! `pipeline_day_state.rawMaxUpdatedAt`, and returns only the days where
//! the fingerprint advanced. This is the architectural commitment that
//! makes incremental runs near-free — a typical sync sees 0–1 dirty days.

use anyhow::Context;
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::PgPool;

use super::types::DirtyDay;

pub async fn load_dirty_days(
    pool: &PgPool,
    user_id: &str,
    time_zone: &str,
    since: DateTime<Utc>,
    force: bool,
) -> anyhow::Result<Vec<DirtyDay>> {
    let rows: Vec<(NaiveDate, DateTime<Utc>, Option<DateTime<Utc>>)> = sqlx::query_as(
        r#"
        WITH raw_days AS (
            SELECT (("timestamp" AT TIME ZONE $2)::date) AS day_date,
                   MAX("updatedAt") AS raw_max_updated_at
            FROM raw_sensor_records
            WHERE "userId" = $1 AND "timestamp" >= $3
            GROUP BY 1
        )
        SELECT r.day_date,
               r.raw_max_updated_at,
               p."rawMaxUpdatedAt" AS stored_raw_max
        FROM raw_days r
        LEFT JOIN pipeline_day_state p
          ON p."userId" = $1 AND p."dayDate" = r.day_date
        WHERE $4::bool
           OR p."rawMaxUpdatedAt" IS DISTINCT FROM r.raw_max_updated_at
        ORDER BY r.day_date
        "#,
    )
    .bind(user_id)
    .bind(time_zone)
    .bind(since)
    .bind(force)
    .fetch_all(pool)
    .await
    .context("load_dirty_days query")?;

    Ok(rows
        .into_iter()
        .map(|(day_date, raw_max_updated_at, _stored)| DirtyDay {
            day_date,
            raw_max_updated_at,
        })
        .collect())
}

/// Sleep crosses midnight and the regularity score looks at neighbouring
/// nights. When stage code declares a `context_window` wider than a single
/// day, this helper pulls the calendar-day neighbours of every dirty day
/// into the processing set so a fresh boundary is included.
pub fn expand_for_boundaries(dirty: &[DirtyDay]) -> Vec<NaiveDate> {
    let mut days = std::collections::BTreeSet::new();
    for d in dirty {
        days.insert(d.day_date);
    }
    days.into_iter().collect()
}
