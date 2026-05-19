pub mod calendar;
pub mod derived_metrics;
pub mod handlers;
pub mod math;
pub mod types;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    routing::{get, post},
};
use tower_http::{
    compression::CompressionLayer, decompression::RequestDecompressionLayer, trace::TraceLayer,
};

pub fn build_app() -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route(
            "/v1/compute/derived-metrics-day",
            post(handlers::compute_day),
        )
        .layer(DefaultBodyLimit::max(32 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new().gzip(true))
        .layer(RequestDecompressionLayer::new().gzip(true))
}
