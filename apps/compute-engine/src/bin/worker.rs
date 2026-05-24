use anyhow::Context;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use chrono::{DateTime, Utc};
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
    time_zone: Option<String>,
    since: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
struct RunTaskResponse {
    user_id: String,
    run_id: Uuid,
    raw_row_count: i64,
    raw_max_timestamp: Option<DateTime<Utc>>,
    status: &'static str,
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

async fn run_task(
    State(state): State<AppState>,
    Json(payload): Json<RunTaskPayload>,
) -> Result<Json<RunTaskResponse>, (StatusCode, String)> {
    let run_id = payload.run_id.unwrap_or_else(Uuid::new_v4);
    let user_id = payload.user_id.clone();

    let row: (Option<i64>, Option<DateTime<Utc>>) = sqlx::query_as(
        r#"
        SELECT COUNT(*)::bigint, MAX("timestamp")
        FROM raw_sensor_records
        WHERE "userId" = $1
        "#,
    )
    .bind(&user_id)
    .fetch_one(state.pool.as_ref())
    .await
    .map_err(|err| {
        tracing::error!(error = %err, %user_id, "run_task: query failed");
        (StatusCode::INTERNAL_SERVER_ERROR, format!("db query failed: {err}"))
    })?;

    let count = row.0.unwrap_or(0);
    let max_ts = row.1;

    tracing::info!(
        %user_id,
        %run_id,
        raw_row_count = count,
        ?max_ts,
        time_zone = ?payload.time_zone,
        since = ?payload.since,
        "run_task: read raw_sensor_records (scaffold — no derivations yet)"
    );

    Ok(Json(RunTaskResponse {
        user_id,
        run_id,
        raw_row_count: count,
        raw_max_timestamp: max_ts,
        status: "scaffold-only",
    }))
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
