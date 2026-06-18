//! Tests for the full on-device pipeline orchestrator.

use noop_compute_engine::{
    derived_metrics::compute_derived_metrics,
    full_pipeline::{FullDayInput, FullDayOutput, compute_full_day},
    types::{
        ComputeDerivedMetricsDayRequestV1, DesaturationScope, NightFeatureSetV1,
        PersistedDailyMetricV1, SleepDetectionSummaryV1,
    },
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
    entries
        .into_iter()
        .next()
        .map(|path| {
            let raw = fs::read_to_string(&path).unwrap();
            let fixture: Fixture = serde_json::from_str(&raw)
                .unwrap_or_else(|e| panic!("parse fixture {path:?}: {e}"));
            fixture.input
        })
        .unwrap_or_else(|| panic!("no golden fixtures"))
}

/// The full pipeline must run without error on real fixture raw data and
/// produce a structurally valid PersistedDailyMetricV1.
#[test]
fn full_pipeline_runs_on_fixture_raw() {
    let req = load_first_fixture();
    let input = FullDayInput {
        samples: req.samples,
        sensor_records: req.sensor_records,
        device_events: vec![],
        prior_night_features: vec![],
        prior_sleep_detections: vec![],
        reference_date: req.reference_date,
        time_zone: req.time_zone,
    };
    let output: FullDayOutput =
        compute_full_day(&input).expect("compute_full_day should not error on fixture data");
    assert_eq!(output.daily_metrics.schema_version, 1);
}

/// Internal consistency: the pipeline's daily_metrics must equal what
/// compute_derived_metrics produces when called directly with the
/// pipeline's OWN upstream outputs (night_features, sleep_detections,
/// baseline).  This proves the orchestrator threads inter-stage data
/// correctly — not that it matches the server (fixtures subsample raw).
#[test]
fn full_pipeline_internal_consistency() {
    let req = load_first_fixture();
    let reference_date = req.reference_date.clone();
    let time_zone = req.time_zone.clone();
    let samples = req.samples;
    let sensor_records = req.sensor_records;

    let input = FullDayInput {
        samples: samples.clone(),
        sensor_records: sensor_records.clone(),
        device_events: vec![],
        prior_night_features: vec![],
        prior_sleep_detections: vec![],
        reference_date: reference_date.clone(),
        time_zone: time_zone.clone(),
    };
    let output = compute_full_day(&input).expect("full pipeline should succeed");

    // Call compute_derived_metrics directly with the pipeline's own upstream
    // outputs — this is the gold standard for internal consistency.
    let direct_req = ComputeDerivedMetricsDayRequestV1 {
        schema_version: 1,
        samples,
        sensor_records,
        night_features: output.night_features.clone(),
        sleep_detections: output.sleep_detections.clone(),
        baseline: output.baseline.clone(),
        reference_date,
        time_zone,
        desaturation_scope: DesaturationScope::ReferenceNight,
    };
    let direct: PersistedDailyMetricV1 =
        compute_derived_metrics(&direct_req).expect("direct compute should succeed");

    let pipeline_json = serde_json::to_value(&output.daily_metrics).unwrap();
    let direct_json = serde_json::to_value(&direct).unwrap();
    assert_eq!(
        pipeline_json, direct_json,
        "pipeline daily_metrics must match direct compute with same upstream outputs"
    );
}

/// Empty input must produce a valid degenerate output — no panic, no error.
#[test]
fn full_pipeline_empty_input_no_panic() {
    let input = FullDayInput {
        samples: vec![],
        sensor_records: vec![],
        device_events: vec![],
        prior_night_features: vec![],
        prior_sleep_detections: vec![],
        reference_date: "2026-01-01".to_string(),
        time_zone: "UTC".to_string(),
    };
    let output = compute_full_day(&input).expect("empty input should not error");
    assert!(output.sleep_detections.is_empty());
    assert!(output.activity_bouts.is_empty());
    assert!(output.sleep_stages.is_empty());
    assert!(output.night_features.is_empty());
    assert!(output.daily_scores.is_empty());
    assert_eq!(output.daily_metrics.schema_version, 1);
}

/// The JSON FFI entrypoint must round-trip correctly.
#[test]
fn full_day_json_round_trip() {
    let input = FullDayInput {
        samples: vec![],
        sensor_records: vec![],
        device_events: vec![],
        prior_night_features: vec![],
        prior_sleep_detections: vec![],
        reference_date: "2026-01-01".to_string(),
        time_zone: "UTC".to_string(),
    };
    let input_json = serde_json::to_string(&input).unwrap();
    let output_json = noop_compute_engine::ffi::compute_full_day_json(&input_json)
        .expect("FFI entrypoint should succeed on empty input");
    let output: FullDayOutput =
        serde_json::from_str(&output_json).expect("output should deserialize back");
    assert_eq!(output.daily_metrics.schema_version, 1);
}

/// Prior night features feed the baseline: with enough valid prior nights,
/// `is_warmed_up` flips true and `nights_used` reflects prior + today.
#[test]
fn prior_night_features_feed_baseline() {
    use chrono::{Duration, TimeZone, Utc};

    let req = load_first_fixture();

    // Run without prior features to establish the no-prior baseline.
    let input_no_prior = FullDayInput {
        samples: req.samples.clone(),
        sensor_records: req.sensor_records.clone(),
        device_events: vec![],
        prior_night_features: vec![],
        prior_sleep_detections: vec![],
        reference_date: req.reference_date.clone(),
        time_zone: req.time_zone.clone(),
    };
    let out_no_prior = compute_full_day(&input_no_prior)
        .expect("compute_full_day should succeed without prior features");

    // Synthesize 10 prior nights with plausible physiology — distinct dates
    // that don't overlap with the fixture's reference window.
    let base_date = Utc.with_ymd_and_hms(2025, 11, 1, 4, 0, 0).unwrap();
    let prior: Vec<NightFeatureSetV1> = (0..10)
        .map(|i| NightFeatureSetV1 {
            night_date: base_date + Duration::days(i),
            resting_heart_rate: 58.0 + (i as f64) * 0.3,
            rmssd: 42.0 + (i as f64) * 0.5,
            sdnn: 55.0 + (i as f64) * 0.4,
            pnn50: 18.0,
            respiratory_rate: 15.5,
            continuity: 0.85,
            regularity: 0.80,
            valid_coverage: 0.90,
            confidence_raw: 0.75,
            sleep_estimate_hours: 7.5,
            source_blend: "ppg".to_string(),
        })
        .collect();

    let input_with_prior = FullDayInput {
        samples: req.samples.clone(),
        sensor_records: req.sensor_records.clone(),
        device_events: vec![],
        prior_night_features: prior,
        prior_sleep_detections: vec![],
        reference_date: req.reference_date.clone(),
        time_zone: req.time_zone.clone(),
    };
    let out_with_prior = compute_full_day(&input_with_prior)
        .expect("compute_full_day should succeed with prior features");

    // The baseline should incorporate more nights.
    assert!(
        out_with_prior.baseline.nights_used > out_no_prior.baseline.nights_used,
        "nights_used should increase with prior features: {} vs {}",
        out_with_prior.baseline.nights_used,
        out_no_prior.baseline.nights_used,
    );

    // 10 prior nights with valid_coverage >= 0.35 should push us past the
    // warm-up threshold of 5 valid nights.
    assert!(
        out_with_prior.baseline.is_warmed_up,
        "baseline should be warmed up with 10 valid prior nights",
    );

    // night_features in the output should contain ONLY the computed
    // (reference-day) features, not the prior history.
    assert_eq!(
        out_with_prior.night_features.len(),
        out_no_prior.night_features.len(),
        "output night_features should only contain the reference day's computed features",
    );
}

/// With `DesaturationScope::ReferenceNight`, desaturation counts must be ≤
/// the `Window` (full-series) count, because the night slice is a subset.
#[test]
fn reference_night_desat_scope_leq_window() {
    use noop_compute_engine::types::DesaturationScope;

    let req = load_first_fixture();

    // Window scope (server default) — run on the full series.
    let window_result = compute_derived_metrics(&ComputeDerivedMetricsDayRequestV1 {
        schema_version: 1,
        samples: req.samples.clone(),
        sensor_records: req.sensor_records.clone(),
        night_features: req.night_features.clone(),
        sleep_detections: req.sleep_detections.clone(),
        baseline: req.baseline.clone(),
        reference_date: req.reference_date.clone(),
        time_zone: req.time_zone.clone(),
        desaturation_scope: DesaturationScope::Window,
    })
    .expect("Window scope should succeed");

    // ReferenceNight scope — sliced to the night window.
    let night_result = compute_derived_metrics(&ComputeDerivedMetricsDayRequestV1 {
        schema_version: 1,
        samples: req.samples.clone(),
        sensor_records: req.sensor_records.clone(),
        night_features: req.night_features.clone(),
        sleep_detections: req.sleep_detections.clone(),
        baseline: req.baseline.clone(),
        reference_date: req.reference_date.clone(),
        time_zone: req.time_zone.clone(),
        desaturation_scope: DesaturationScope::ReferenceNight,
    })
    .expect("ReferenceNight scope should succeed");

    // Night-scoped counts must be ≤ full-window counts (subset).
    let window_dips = window_result.spo2_dip_count.unwrap_or(0.0);
    let night_dips = night_result.spo2_dip_count.unwrap_or(0.0);
    assert!(
        night_dips <= window_dips,
        "night-scoped dips ({night_dips}) should be <= window dips ({window_dips})",
    );

    // ODI follows the same invariant (or both None).
    if let (Some(w), Some(n)) = (window_result.odi_per_hour, night_result.odi_per_hour) {
        // ODI is dips/hours; the night window is shorter, so even if dip
        // count is much lower, the per-hour rate CAN be higher.  We only
        // assert that the absolute dip count is ≤.
        let _ = (w, n); // suppress unused
    }

    // lowest_spo2 in the night window should be >= the full window's
    // lowest (the worst reading may fall outside the night).
    if let (Some(w), Some(n)) = (window_result.lowest_spo2, night_result.lowest_spo2) {
        assert!(
            n >= w,
            "night lowest_spo2 ({n}) should be >= window lowest ({w})",
        );
    }
}

/// Passing `prior_sleep_detections` covering the prior week makes
/// `detected_sleep_nights` reflect prior + today vs reference-only.
#[test]
fn prior_sleep_detections_feed_detected_nights() {
    use chrono::{Datelike, Duration, TimeZone, Utc};

    let req = load_first_fixture();

    // Run without prior sleep detections.
    let input_no_prior = FullDayInput {
        samples: req.samples.clone(),
        sensor_records: req.sensor_records.clone(),
        device_events: vec![],
        prior_night_features: vec![],
        prior_sleep_detections: vec![],
        reference_date: req.reference_date.clone(),
        time_zone: req.time_zone.clone(),
    };
    let out_no_prior =
        compute_full_day(&input_no_prior).expect("should succeed without prior detections");
    let nights_no_prior = out_no_prior.daily_metrics.detected_sleep_nights;

    // Synthesize 5 prior sleep detections covering the 5 nights before
    // the reference date (nights -6 through -2).  Use the reference
    // date parsed to generate plausible timestamps.
    let ref_date = chrono::NaiveDate::parse_from_str(&req.reference_date, "%Y-%m-%d")
        .expect("fixture reference_date should parse");
    let prior_detections: Vec<SleepDetectionSummaryV1> = (2..=6)
        .map(|days_ago| {
            let night = ref_date - chrono::Duration::days(days_ago);
            let night_dt = Utc
                .with_ymd_and_hms(night.year(), night.month(), night.day(), 4, 0, 0)
                .unwrap();
            let bedtime = night_dt - Duration::hours(6);
            let wake_time = night_dt + Duration::hours(1);
            SleepDetectionSummaryV1 {
                night_date: night_dt,
                bedtime,
                wake_time,
                duration_hours: 7.0,
                interruption_count: 1.0,
                continuity: 0.88,
                regularity: 0.82,
                valid_coverage: 0.92,
                confidence: 0.75,
            }
        })
        .collect();

    let input_with_prior = FullDayInput {
        samples: req.samples.clone(),
        sensor_records: req.sensor_records.clone(),
        device_events: vec![],
        prior_night_features: vec![],
        prior_sleep_detections: prior_detections,
        reference_date: req.reference_date.clone(),
        time_zone: req.time_zone.clone(),
    };
    let out_with_prior =
        compute_full_day(&input_with_prior).expect("should succeed with prior detections");
    let nights_with_prior = out_with_prior.daily_metrics.detected_sleep_nights;

    // With 5 extra prior detections that have valid_coverage >= 0.35,
    // the 7-day rolling count must be strictly higher.
    assert!(
        nights_with_prior > nights_no_prior,
        "detected_sleep_nights with prior ({nights_with_prior}) should exceed \
         without prior ({nights_no_prior})",
    );
}
