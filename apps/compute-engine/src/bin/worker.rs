use anyhow::Context;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::{net::SocketAddr, sync::Arc, time::Duration};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    pool: Arc<PgPool>,
}

#[derive(Debug, Deserialize)]
struct RunTaskPayload {
    user_id: String,
    run_id: Option<Uuid>,
    /// IANA name; defaults to UTC for the day-grouping if absent.
    time_zone: Option<String>,
    /// Earliest raw timestamp the worker should consider. Defaults to
    /// now - 45 days to match NestJS's window.
    since: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
struct RunTaskResponse {
    user_id: String,
    run_id: Uuid,
    raw_row_count: i64,
    raw_max_timestamp: Option<DateTime<Utc>>,
    /// Number of (userId, dayDate) rows the worker upserted into
    /// pipeline_day_state during this call.
    day_state_upserts: u64,
    status: &'static str,
}

#[derive(Debug)]
struct DayFingerprint {
    day_date: NaiveDate,
    raw_max_updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    db: &'static str,
}

async fn healthz(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(state.pool.as_ref())
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(HealthResponse { status: "ok", db: "ok" }),
        ),
        Err(err) => {
            tracing::error!(error = %err, "healthz db check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(HealthResponse { status: "degraded", db: "unreachable" }),
            )
        }
    }
}

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const WORKER_SOURCE: &str = "rust-worker";

async fn run_task(
    State(state): State<AppState>,
    Json(payload): Json<RunTaskPayload>,
) -> Result<Json<RunTaskResponse>, (StatusCode, String)> {
    let run_id = payload.run_id.unwrap_or_else(Uuid::new_v4);
    let user_id = payload.user_id.clone();
    let time_zone = payload.time_zone.as_deref().unwrap_or("UTC").to_string();
    let since = payload
        .since
        .unwrap_or_else(|| Utc::now() - chrono::Duration::days(45));
    let lease_id = Uuid::new_v4().to_string();

    // Claim the lease. The row was inserted by NestJS at /pipeline/run
    // time with status='queued'. We compare-and-swap to 'running'; if
    // someone else got there first (or the row doesn't exist), refuse.
    let claimed = claim_lease(state.pool.as_ref(), run_id, &lease_id)
        .await
        .map_err(|err| {
            tracing::error!(error = %err, %user_id, %run_id, "claim_lease failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("claim_lease failed: {err}"),
            )
        })?;
    if !claimed {
        tracing::warn!(%user_id, %run_id, "claim_lease: row not in 'queued' state, skipping");
        return Err((
            StatusCode::CONFLICT,
            format!("run {run_id} is not queued (already claimed or terminal)"),
        ));
    }

    // Spawn a heartbeat task that bumps heartbeatAt every 30s. Returns
    // a CancellationToken-like via a oneshot so we can stop it when
    // the run terminates.
    let pool_for_hb = state.pool.clone();
    let lease_for_hb = lease_id.clone();
    let (hb_stop_tx, mut hb_stop_rx) = tokio::sync::oneshot::channel::<()>();
    let hb_task = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(HEARTBEAT_INTERVAL);
        ticker.tick().await; // first tick fires immediately; consume it
        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    if let Err(err) = bump_heartbeat(pool_for_hb.as_ref(), run_id, &lease_for_hb).await {
                        tracing::warn!(error = %err, %run_id, "heartbeat bump failed");
                    }
                }
                _ = &mut hb_stop_rx => break,
            }
        }
    });

    let outcome = do_run_work(state.pool.as_ref(), &user_id, &time_zone, since).await;

    // Stop the heartbeat task before finalizing so we don't race the
    // terminal update.
    let _ = hb_stop_tx.send(());
    let _ = hb_task.await;

    match outcome {
        Ok(report) => {
            if let Err(err) = finalize_lease(
                state.pool.as_ref(),
                run_id,
                &lease_id,
                /* success */ true,
                None,
            )
            .await
            {
                tracing::error!(error = %err, %run_id, "finalize_lease (success) failed");
            }
            tracing::info!(
                %user_id,
                %run_id,
                raw_row_count = report.raw_row_count,
                ?report.raw_max_timestamp,
                %time_zone,
                ?since,
                day_state_upserts = report.day_state_upserts,
                "run_task: per-day fingerprints persisted"
            );
            Ok(Json(RunTaskResponse {
                user_id,
                run_id,
                raw_row_count: report.raw_row_count,
                raw_max_timestamp: report.raw_max_timestamp,
                day_state_upserts: report.day_state_upserts,
                status: "fingerprints-only",
            }))
        }
        Err(err) => {
            let msg = format!("{err:#}");
            if let Err(fin_err) = finalize_lease(
                state.pool.as_ref(),
                run_id,
                &lease_id,
                /* success */ false,
                Some(&msg),
            )
            .await
            {
                tracing::error!(error = %fin_err, %run_id, "finalize_lease (failure) failed");
            }
            tracing::error!(%user_id, %run_id, error = %msg, "run_task failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, msg))
        }
    }
}

struct RunReport {
    raw_row_count: i64,
    raw_max_timestamp: Option<DateTime<Utc>>,
    day_state_upserts: u64,
}

async fn do_run_work(
    pool: &PgPool,
    user_id: &str,
    time_zone: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<RunReport> {
    let row: (Option<i64>, Option<DateTime<Utc>>) = sqlx::query_as(
        r#"
        SELECT COUNT(*)::bigint, MAX("timestamp")
        FROM raw_sensor_records
        WHERE "userId" = $1 AND "timestamp" >= $2
        "#,
    )
    .bind(user_id)
    .bind(since)
    .fetch_one(pool)
    .await
    .context("raw_sensor_records count query")?;

    let count = row.0.unwrap_or(0);
    let max_ts = row.1;

    let fingerprints = day_fingerprints(pool, user_id, time_zone, since).await?;
    let day_state_upserts = upsert_day_state(pool, user_id, &fingerprints).await?;

    Ok(RunReport {
        raw_row_count: count,
        raw_max_timestamp: max_ts,
        day_state_upserts,
    })
}

/// Compare-and-swap status='queued' → 'running'. Returns true if we
/// successfully claimed the row, false if someone else already moved
/// it past 'queued' or it doesn't exist.
async fn claim_lease(pool: &PgPool, run_id: Uuid, lease_id: &str) -> anyhow::Result<bool> {
    let res = sqlx::query(
        r#"
        UPDATE pipeline_runs
        SET status = 'running',
            "leaseId" = $2,
            "workerSource" = $3,
            "heartbeatAt" = NOW(),
            "startedAt" = NOW()
        WHERE id = $1
          AND status = 'queued'
        "#,
    )
    .bind(run_id)
    .bind(lease_id)
    .bind(WORKER_SOURCE)
    .execute(pool)
    .await
    .context("claim_lease update")?;
    Ok(res.rows_affected() == 1)
}

/// Bump heartbeatAt only if we still own the lease. If another worker
/// took over (leaseId changed) or the row terminated, this is a no-op.
async fn bump_heartbeat(pool: &PgPool, run_id: Uuid, lease_id: &str) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        UPDATE pipeline_runs
        SET "heartbeatAt" = NOW()
        WHERE id = $1
          AND "leaseId" = $2
          AND status = 'running'
        "#,
    )
    .bind(run_id)
    .bind(lease_id)
    .execute(pool)
    .await
    .context("bump_heartbeat update")?;
    Ok(())
}

/// Flip status → 'succeeded' or 'failed' and clear heartbeatAt so the
/// stale-run sweeper doesn't pick up the terminated row.
async fn finalize_lease(
    pool: &PgPool,
    run_id: Uuid,
    lease_id: &str,
    success: bool,
    error_msg: Option<&str>,
) -> anyhow::Result<()> {
    let status = if success { "succeeded" } else { "failed" };
    sqlx::query(
        r#"
        UPDATE pipeline_runs
        SET status = $3,
            "completedAt" = NOW(),
            "heartbeatAt" = NULL,
            error = $4
        WHERE id = $1
          AND "leaseId" = $2
        "#,
    )
    .bind(run_id)
    .bind(lease_id)
    .bind(status)
    .bind(error_msg.map(|s| s.chars().take(500).collect::<String>()))
    .execute(pool)
    .await
    .context("finalize_lease update")?;
    Ok(())
}

/// Group raw_sensor_records by user-local calendar day and return the
/// max("updatedAt") observed per day. The day_date in the result is in
/// the user's timezone (IANA name).
async fn day_fingerprints(
    pool: &PgPool,
    user_id: &str,
    time_zone: &str,
    since: DateTime<Utc>,
) -> anyhow::Result<Vec<DayFingerprint>> {
    let rows: Vec<(NaiveDate, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT
            (("timestamp" AT TIME ZONE $2)::date) AS day,
            MAX("updatedAt") AS raw_max_updated_at
        FROM raw_sensor_records
        WHERE "userId" = $1
          AND "timestamp" >= $3
        GROUP BY day
        ORDER BY day
        "#,
    )
    .bind(user_id)
    .bind(time_zone)
    .bind(since)
    .fetch_all(pool)
    .await
    .context("day_fingerprints query")?;

    Ok(rows
        .into_iter()
        .map(|(day_date, raw_max_updated_at)| DayFingerprint {
            day_date,
            raw_max_updated_at,
        })
        .collect())
}

/// Upsert (userId, dayDate) → rawMaxUpdatedAt. ON CONFLICT keeps
/// lastComputedAt + computedRevision untouched (they belong to the
/// re-derive step, which Phase B owns). Returns the number of rows
/// affected.
async fn upsert_day_state(
    pool: &PgPool,
    user_id: &str,
    fingerprints: &[DayFingerprint],
) -> anyhow::Result<u64> {
    if fingerprints.is_empty() {
        return Ok(0);
    }
    let mut total: u64 = 0;
    for fp in fingerprints {
        let result = sqlx::query(
            r#"
            INSERT INTO pipeline_day_state
                ("userId", "dayDate", "rawMaxUpdatedAt", "updatedAt")
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT ("userId", "dayDate") DO UPDATE
            SET "rawMaxUpdatedAt" = EXCLUDED."rawMaxUpdatedAt",
                "updatedAt" = NOW()
            WHERE pipeline_day_state."rawMaxUpdatedAt" IS DISTINCT FROM EXCLUDED."rawMaxUpdatedAt"
            "#,
        )
        .bind(user_id)
        .bind(fp.day_date)
        .bind(fp.raw_max_updated_at)
        .execute(pool)
        .await
        .with_context(|| format!("upsert pipeline_day_state for {} {}", user_id, fp.day_date))?;
        total += result.rows_affected();
    }
    Ok(total)
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/v1/worker/run", post(run_task))
        .with_state(state)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().json().with_target(false).init();

    let database_url = std::env::var("DATABASE_URL")
        .context("DATABASE_URL is required for the pipeline worker")?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&database_url)
        .await
        .context("failed to open Postgres connection pool")?;

    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .context("Postgres connectivity check failed at boot")?;

    let state = AppState { pool: Arc::new(pool) };

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "noop-pipeline-worker listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, build_router(state)).await?;
    Ok(())
}
