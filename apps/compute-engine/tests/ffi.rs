//! Verifies the on-device FFI entrypoint (`compute_derived_metrics_day_json`)
//! is a faithful pass-through of the same compute the HTTP server runs. This
//! is the property that lets the device author derived metrics that match the
//! server bit-for-bit (the basis for shadow-mode parity before cutover).

use hale_compute_engine::{
    derived_metrics::compute_derived_metrics,
    ffi::compute_derived_metrics_day_json,
    types::{ComputeDerivedMetricsDayRequestV1, PersistedDailyMetricV1},
};
use std::{fs, path::PathBuf};

#[derive(serde::Deserialize)]
struct Fixture {
    input: ComputeDerivedMetricsDayRequestV1,
}

fn load_first_fixture() -> ComputeDerivedMetricsDayRequestV1 {
    let dir =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/compute-engine-golden");
    let mut entries: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read fixtures dir {dir:?}: {e}"))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("json"))
        .collect();
    entries.sort();
    let path = entries
        .into_iter()
        .next()
        .unwrap_or_else(|| panic!("no golden fixtures in {dir:?}"));
    let raw = fs::read_to_string(&path).unwrap();
    let fixture: Fixture =
        serde_json::from_str(&raw).unwrap_or_else(|e| panic!("parse fixture {path:?}: {e}"));
    fixture.input
}

#[test]
fn json_entrypoint_matches_direct_compute() {
    let req = load_first_fixture();
    let direct: PersistedDailyMetricV1 = compute_derived_metrics(&req).unwrap();

    let req_json = serde_json::to_string(&req).unwrap();
    let out_json = compute_derived_metrics_day_json(&req_json).unwrap();
    let via_ffi: PersistedDailyMetricV1 = serde_json::from_str(&out_json).unwrap();

    // Same input → identical output through the JSON boundary. If this ever
    // diverges, the device and server would disagree on a user's metrics.
    assert_eq!(
        serde_json::to_value(&direct).unwrap(),
        serde_json::to_value(&via_ffi).unwrap(),
    );
}

#[test]
fn json_entrypoint_rejects_unsupported_schema_version() {
    let mut req = load_first_fixture();
    req.schema_version = 2;
    let req_json = serde_json::to_string(&req).unwrap();
    let err = compute_derived_metrics_day_json(&req_json).unwrap_err();
    assert!(err.to_string().contains("schemaVersion"), "got: {err}");
}

#[test]
fn json_entrypoint_rejects_malformed_json() {
    let err = compute_derived_metrics_day_json("{ not json").unwrap_err();
    assert!(
        err.to_string().contains("invalid request json"),
        "got: {err}"
    );
}
