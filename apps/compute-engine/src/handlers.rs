use axum::{http::StatusCode, response::IntoResponse, Json};
use std::time::Duration;
use tokio::time::timeout;

use crate::{derived_metrics::compute_derived_metrics, types::ComputeDerivedMetricsDayRequestV1};

const SERVER_DEADLINE: Duration = Duration::from_secs(25);

pub async fn compute_day(
    Json(req): Json<ComputeDerivedMetricsDayRequestV1>,
) -> impl IntoResponse {
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
