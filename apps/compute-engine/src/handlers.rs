use axum::{Json, http::StatusCode, response::IntoResponse};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::time::timeout;

use crate::{
    derived_metrics::compute_derived_metrics,
    types::{
        ComputeBatchRequestV1, ComputeBatchResultEntry, ComputeBatchResultV1,
        ComputeDerivedMetricsDayRequestV1,
    },
};

const SERVER_DEADLINE: Duration = Duration::from_secs(25);
// Batch endpoint can chew through up to 45 days; give it more headroom.
const BATCH_SERVER_DEADLINE: Duration = Duration::from_secs(115);

pub async fn compute_day(Json(req): Json<ComputeDerivedMetricsDayRequestV1>) -> impl IntoResponse {
    if req.schema_version != 1 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "unsupported schemaVersion",
                "got": req.schema_version,
            })),
        )
            .into_response();
    }
    let span = tracing::info_span!(
        "compute_day",
        reference_date = %req.reference_date,
        samples = req.samples.len(),
        sensor_records = req.sensor_records.len(),
        time_zone = %req.time_zone,
    );
    let _enter = span.enter();
    let join = tokio::task::spawn_blocking(move || compute_derived_metrics(&req));
    match timeout(SERVER_DEADLINE, join).await {
        Ok(Ok(Ok(metrics))) => (StatusCode::OK, Json(metrics)).into_response(),
        Ok(Ok(Err(e))) => {
            tracing::error!(error = %e, "compute_derived_metrics failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
        Ok(Err(join_err)) => {
            tracing::error!(error = %join_err, "spawn_blocking join failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "internal"})),
            )
                .into_response()
        }
        Err(_) => {
            tracing::warn!("server-side 25s deadline exceeded; returning 503");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "deadline_exceeded"})),
            )
                .into_response()
        }
    }
}

pub async fn compute_batch(Json(req): Json<ComputeBatchRequestV1>) -> impl IntoResponse {
    if req.schema_version != 1 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "unsupported schemaVersion",
                "got": req.schema_version,
            })),
        )
            .into_response();
    }
    let span = tracing::info_span!(
        "compute_batch",
        days = req.day_dates.len(),
        samples = req.samples.len(),
        sensor_records = req.sensor_records.len(),
        time_zone = %req.time_zone,
    );
    let _enter = span.enter();

    // Cooperative cancellation flag (codex adversarial review 2026-05-21,
    // finding #4). When the outer timeout fires, we flip this and the
    // blocking worker bails between days instead of running the next
    // compute_derived_metrics call. Without this the spawn_blocking
    // kept burning CPU after we'd already returned 503, hiding the real
    // capacity drain.
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_worker = Arc::clone(&cancel);
    let deadline_at = Instant::now() + BATCH_SERVER_DEADLINE;

    let join = tokio::task::spawn_blocking(move || -> Result<ComputeBatchResultV1, String> {
        // Build a per-day request that reuses the shared input arrays by
        // cloning. Inputs are not mutated, so cloning is just a memcpy of
        // the Vec headers + a shallow ref-bump on the heap-backed strings.
        // The expensive precompute work happens inside compute_derived_metrics
        // per day; that's accepted as Phase 1 parity — Phase 3 can hoist it.
        let mut entries: Vec<ComputeBatchResultEntry> = Vec::with_capacity(req.day_dates.len());
        for day in req.day_dates.iter() {
            // Deadline-check before each day so a worker that's already
            // past the budget stops burning CPU instead of plowing on.
            if cancel_worker.load(Ordering::Relaxed) || Instant::now() >= deadline_at {
                return Err("deadline_exceeded".to_string());
            }
            let day_req = ComputeDerivedMetricsDayRequestV1 {
                schema_version: 1,
                samples: req.samples.clone(),
                sensor_records: req.sensor_records.clone(),
                night_features: req.night_features.clone(),
                sleep_detections: req.sleep_detections.clone(),
                baseline: req.baseline.clone(),
                reference_date: day.clone(),
                time_zone: req.time_zone.clone(),
            };
            let metrics = compute_derived_metrics(&day_req).map_err(|e| e.to_string())?;
            entries.push(ComputeBatchResultEntry {
                day_date: day.clone(),
                metrics,
            });
        }
        Ok(ComputeBatchResultV1 {
            schema_version: 1,
            derived_metrics_by_day: entries,
        })
    });

    match timeout(BATCH_SERVER_DEADLINE, join).await {
        Ok(Ok(Ok(result))) => (StatusCode::OK, Json(result)).into_response(),
        Ok(Ok(Err(e))) => {
            tracing::error!(error = %e, "compute_batch failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e})),
            )
                .into_response()
        }
        Ok(Err(join_err)) => {
            tracing::error!(error = %join_err, "spawn_blocking join failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "internal"})),
            )
                .into_response()
        }
        Err(_) => {
            tracing::warn!("batch server-side 115s deadline exceeded; returning 503");
            // Flip the cancel flag so the blocking worker stops at the
            // next per-day check instead of consuming CPU after the
            // handler returns. The worker can't be force-cancelled from
            // Tokio, but the cooperative check between days bounds the
            // wasted work to one compute_derived_metrics call.
            cancel.store(true, Ordering::Relaxed);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "deadline_exceeded"})),
            )
                .into_response()
        }
    }
}
