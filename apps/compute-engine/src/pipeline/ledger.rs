//! Stage-state ledger: one row per `(userId, dayDate, stage)` capturing
//! the input fingerprint, status, runId, timings, and stats. Stages
//! consult this table to decide whether their input has changed enough
//! to warrant re-running. Operationally it answers "which days/stages
//! are stale across all users?" with a single SELECT.

use anyhow::Context;
use chrono::{NaiveDate, Utc};
use sqlx::{Executor, PgPool, Postgres};
use uuid::Uuid;

use super::types::{DirtyDay, StageName};

pub struct StageLedger;

impl StageLedger {
    /// Upsert `pipeline_day_state.rawMaxUpdatedAt` for every dirty day.
    /// Keeps `lastComputedAt` + `computedRevision` untouched — those are
    /// owned by the per-stage flow.
    pub async fn upsert_raw_day_state(
        pool: &PgPool,
        user_id: &str,
        dirty: &[DirtyDay],
    ) -> anyhow::Result<u64> {
        if dirty.is_empty() {
            return Ok(0);
        }
        let mut total: u64 = 0;
        for d in dirty {
            let result = sqlx::query(
                r#"
                INSERT INTO pipeline_day_state
                    ("userId", "dayDate", "rawMaxUpdatedAt", "updatedAt")
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT ("userId", "dayDate") DO UPDATE
                SET "rawMaxUpdatedAt" = EXCLUDED."rawMaxUpdatedAt",
                    "updatedAt" = NOW()
                WHERE pipeline_day_state."rawMaxUpdatedAt"
                  IS DISTINCT FROM EXCLUDED."rawMaxUpdatedAt"
                "#,
            )
            .bind(user_id)
            .bind(d.day_date)
            .bind(d.raw_max_updated_at)
            .execute(pool)
            .await
            .with_context(|| format!("upsert pipeline_day_state for {} {}", user_id, d.day_date))?;
            total += result.rows_affected();
        }
        Ok(total)
    }

    /// Insert-or-update the stage_state row. If `inputFingerprint` advanced,
    /// flip status to `pending` and clear error so the planner picks it up.
    /// Returns true when the row was (re)marked pending — i.e. the stage
    /// needs to run for this `(user, day)`.
    pub async fn mark_pending_if_changed(
        pool: &PgPool,
        run_id: Uuid,
        user_id: &str,
        day: NaiveDate,
        stage: StageName,
        input_fingerprint: &str,
    ) -> anyhow::Result<bool> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"
            INSERT INTO pipeline_stage_state
                ("userId","dayDate","stage","inputFingerprint","status","runId","updatedAt")
            VALUES ($1,$2,$3,$4,'pending',$5,NOW())
            ON CONFLICT ("userId","dayDate","stage") DO UPDATE
            SET "inputFingerprint" = EXCLUDED."inputFingerprint",
                "status" = CASE
                  WHEN pipeline_stage_state."inputFingerprint"
                       IS DISTINCT FROM EXCLUDED."inputFingerprint"
                    THEN 'pending'
                  ELSE pipeline_stage_state."status"
                END,
                "error" = CASE
                  WHEN pipeline_stage_state."inputFingerprint"
                       IS DISTINCT FROM EXCLUDED."inputFingerprint"
                    THEN NULL
                  ELSE pipeline_stage_state."error"
                END,
                "runId" = EXCLUDED."runId",
                "updatedAt" = NOW()
            RETURNING "status"
            "#,
        )
        .bind(user_id)
        .bind(day)
        .bind(stage.as_str())
        .bind(input_fingerprint)
        .bind(run_id)
        .fetch_optional(pool)
        .await
        .with_context(|| format!("mark_pending_if_changed for {user_id} {day} {stage}"))?;
        Ok(row.map(|(s,)| s == "pending").unwrap_or(false))
    }

    pub async fn mark_running<'e, E>(
        executor: E,
        run_id: Uuid,
        user_id: &str,
        day: NaiveDate,
        stage: StageName,
    ) -> anyhow::Result<()>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query(
            r#"
            UPDATE pipeline_stage_state
            SET "status" = 'running',
                "startedAt" = NOW(),
                "runId" = $4,
                "error" = NULL,
                "updatedAt" = NOW()
            WHERE "userId" = $1 AND "dayDate" = $2 AND "stage" = $3
            "#,
        )
        .bind(user_id)
        .bind(day)
        .bind(stage.as_str())
        .bind(run_id)
        .execute(executor)
        .await
        .context("mark_running update")?;
        Ok(())
    }

    pub async fn mark_succeeded<'e, E>(
        executor: E,
        run_id: Uuid,
        user_id: &str,
        day: NaiveDate,
        stage: StageName,
        stats: serde_json::Value,
    ) -> anyhow::Result<()>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query(
            r#"
            UPDATE pipeline_stage_state
            SET "status" = 'succeeded',
                "completedAt" = NOW(),
                "durationMs" = (EXTRACT(EPOCH FROM (NOW() - "startedAt")) * 1000)::int,
                "outputRevision" = "outputRevision" + 1,
                "runId" = $4,
                "error" = NULL,
                "stats" = $5,
                "updatedAt" = NOW()
            WHERE "userId" = $1 AND "dayDate" = $2 AND "stage" = $3
            "#,
        )
        .bind(user_id)
        .bind(day)
        .bind(stage.as_str())
        .bind(run_id)
        .bind(stats)
        .execute(executor)
        .await
        .context("mark_succeeded update")?;
        Ok(())
    }

    pub async fn mark_failed<'e, E>(
        executor: E,
        run_id: Uuid,
        user_id: &str,
        day: NaiveDate,
        stage: StageName,
        error: &str,
    ) -> anyhow::Result<()>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query(
            r#"
            UPDATE pipeline_stage_state
            SET "status" = 'failed',
                "completedAt" = NOW(),
                "durationMs" = (EXTRACT(EPOCH FROM (NOW() - COALESCE("startedAt", NOW()))) * 1000)::int,
                "runId" = $4,
                "error" = $5,
                "updatedAt" = NOW()
            WHERE "userId" = $1 AND "dayDate" = $2 AND "stage" = $3
            "#,
        )
        .bind(user_id)
        .bind(day)
        .bind(stage.as_str())
        .bind(run_id)
        .bind(error)
        .execute(executor)
        .await
        .context("mark_failed update")?;
        Ok(())
    }

    /// Compute the input fingerprint for `(user, day, stage)`. For Week 1
    /// this is just the raw fingerprint; once dependent stages land it
    /// will incorporate the upstream stages' `outputRevision`.
    pub fn fingerprint(
        raw_max_updated_at: chrono::DateTime<Utc>,
        stage: StageName,
        deps: &[(StageName, i32)],
    ) -> String {
        let mut parts = vec![format!("raw={}", raw_max_updated_at.timestamp_millis())];
        parts.push(format!("stage={}", stage.as_str()));
        for (dep, rev) in deps {
            parts.push(format!("{}={rev}", dep.as_str()));
        }
        parts.join("|")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn fingerprint_is_stable_for_same_inputs() {
        let ts = Utc.with_ymd_and_hms(2026, 5, 25, 12, 0, 0).unwrap();
        let a = StageLedger::fingerprint(ts, StageName::SleepDetect, &[]);
        let b = StageLedger::fingerprint(ts, StageName::SleepDetect, &[]);
        assert_eq!(a, b);
    }

    #[test]
    fn fingerprint_changes_when_raw_advances() {
        let ts1 = Utc.with_ymd_and_hms(2026, 5, 25, 12, 0, 0).unwrap();
        let ts2 = Utc.with_ymd_and_hms(2026, 5, 25, 12, 0, 1).unwrap();
        assert_ne!(
            StageLedger::fingerprint(ts1, StageName::SleepDetect, &[]),
            StageLedger::fingerprint(ts2, StageName::SleepDetect, &[]),
        );
    }

    #[test]
    fn fingerprint_includes_dependency_revisions() {
        let ts = Utc.with_ymd_and_hms(2026, 5, 25, 12, 0, 0).unwrap();
        let no_deps = StageLedger::fingerprint(ts, StageName::ActivityDetect, &[]);
        let with_dep = StageLedger::fingerprint(
            ts,
            StageName::ActivityDetect,
            &[(StageName::SleepDetect, 3)],
        );
        assert_ne!(no_deps, with_dep);
    }
}
