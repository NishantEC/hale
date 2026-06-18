//! FFI-friendly, dependency-light entrypoints for running the derived-metrics
//! computation off-server — e.g. on-device via a React Native native module.
//!
//! These take and return JSON strings so a native/UniFFI binding only has to
//! marshal strings across the boundary. The math is the exact same
//! [`compute_derived_metrics`] the HTTP server runs, so on-device output is
//! identical to server output for identical input — there is no second
//! implementation to drift out of sync.
//!
//! With the `uniffi` feature enabled, [`compute_derived_metrics_day_json`] is
//! exported across the FFI boundary (the binding generator emits Swift/Kotlin
//! that call it). Without the feature it is an ordinary Rust function, so the
//! server/worker builds and tests use it directly with no UniFFI dependency.

use crate::derived_metrics::compute_derived_metrics;
use crate::full_pipeline::{self, FullDayInput};
use crate::types::ComputeDerivedMetricsDayRequestV1;

/// Error returned by the on-device compute entrypoint. `flat_error` marshals
/// each variant across the FFI boundary as its `Display` string, which is all
/// a caller needs to surface or log.
#[derive(Debug, thiserror::Error)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Error))]
#[cfg_attr(feature = "uniffi", uniffi(flat_error))]
pub enum ComputeFfiError {
    #[error("invalid request json: {0}")]
    InvalidJson(String),
    #[error("unsupported schemaVersion: {0} (expected 1)")]
    UnsupportedSchemaVersion(u32),
    #[error("compute failed: {0}")]
    Compute(String),
    #[error("serialize response: {0}")]
    Serialize(String),
}

/// Compute one day's derived metrics from a JSON-encoded
/// [`ComputeDerivedMetricsDayRequestV1`], returning the resulting
/// `PersistedDailyMetricV1` as JSON.
///
/// The schema-version guard mirrors the HTTP `compute_day` handler so the
/// on-device path rejects the same inputs the server does.
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn compute_derived_metrics_day_json(request_json: &str) -> Result<String, ComputeFfiError> {
    let req: ComputeDerivedMetricsDayRequestV1 = serde_json::from_str(request_json)
        .map_err(|e| ComputeFfiError::InvalidJson(e.to_string()))?;
    if req.schema_version != 1 {
        return Err(ComputeFfiError::UnsupportedSchemaVersion(
            req.schema_version,
        ));
    }
    let metric =
        compute_derived_metrics(&req).map_err(|e| ComputeFfiError::Compute(e.to_string()))?;
    serde_json::to_string(&metric).map_err(|e| ComputeFfiError::Serialize(e.to_string()))
}

/// Run the full 5-stage daily pipeline from a JSON-encoded [`FullDayInput`],
/// returning the resulting [`FullDayOutput`](full_pipeline::FullDayOutput) as
/// JSON. This is the on-device counterpart of the server's pipeline worker.
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn compute_full_day_json(request_json: &str) -> Result<String, ComputeFfiError> {
    let input: FullDayInput = serde_json::from_str(request_json)
        .map_err(|e| ComputeFfiError::InvalidJson(e.to_string()))?;
    let output = full_pipeline::compute_full_day(&input)
        .map_err(|e| ComputeFfiError::Compute(e.to_string()))?;
    serde_json::to_string(&output).map_err(|e| ComputeFfiError::Serialize(e.to_string()))
}
