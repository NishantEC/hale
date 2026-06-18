//! Full-day on-device orchestrator — pure in-memory pipeline that chains the
//! same math functions the server worker runs, without any DB / sqlx / tokio
//! dependency.  The device feeds a ~60-day raw window and gets back all
//! derived data for the reference date.
//!
//! Stage order (mirrors the server worker):
//!   1. sleep_detect   → Vec<SleepDetectionSummary>
//!   2. activity_detect → Vec<ActivityBout>
//!   3. sleep_stages    → Vec<SleepStageSummary>
//!   4. wellness        → night_features + baseline + daily_scores
//!   5. derived_metrics → PersistedDailyMetricV1

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::derived_metrics::{ComputeError, compute_derived_metrics};
use crate::math::activity_detect;
use crate::math::epoch_features;
use crate::math::sleep_detect;
use crate::math::sleep_stages;
use crate::math::wellness_scoring;
use crate::types::{
    ActivityBoutV1, BaselineProfileV1, ComputeDerivedMetricsDayRequestV1, DesaturationScope,
    HistoricalSensorRecordV1, NightFeatureSetV1, PersistedDailyMetricV1, SignalSampleV1,
    SleepDetectionSummaryV1,
};

// ─────────────────────────── Input types ───────────────────────────

/// A single device wrist-event (on/off/charging). Event numbers follow the
/// openWhoop BLE reverse-engineering:
///   10 = wrist-off start, 9 = wrist-off end,
///    7 = charging start,  8 = charging end.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceEventV1 {
    pub event_number: i32,
    pub captured_at: DateTime<Utc>,
}

/// Everything the device must supply for a full pipeline run.  `samples`
/// and `sensor_records` cover the reference day's raw window (typically a
/// single day or a few days).  `prior_night_features` supplies the
/// trailing 60-night history of *already-computed* night features so the
/// baseline has enough history without shipping 60 days of raw.
/// `reference_date` is the single day whose `PersistedDailyMetricV1` the
/// caller wants back.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullDayInput {
    pub samples: Vec<SignalSampleV1>,
    pub sensor_records: Vec<HistoricalSensorRecordV1>,
    #[serde(default)]
    pub device_events: Vec<DeviceEventV1>,
    /// Pre-computed night features from prior days.  The pipeline merges
    /// these with the reference day's computed features before calculating
    /// the baseline and daily score z-scores.  When empty (the default),
    /// behavior is identical to the original all-raw pipeline.
    #[serde(default)]
    pub prior_night_features: Vec<NightFeatureSetV1>,
    /// Pre-computed sleep detections from prior nights (up to 6 nights
    /// before the reference date).  The pipeline merges these with the
    /// reference window's computed detections so that
    /// `detected_sleep_nights` (a rolling 7-day count) is correct even
    /// when the raw sensor window is shorter than 7 days.  When empty
    /// (the default), only the reference window's detections are counted.
    #[serde(default)]
    pub prior_sleep_detections: Vec<SleepDetectionSummaryV1>,
    pub reference_date: String,
    pub time_zone: String,
}

// ─────────────────────────── Output DTOs ──────────────────────────

/// Serde-friendly projection of `sleep_stages::SleepStageSummary`.
/// The per-epoch timeline is omitted to keep the wire payload small;
/// the minute totals are the actionable output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SleepStageSummaryDto {
    pub night_date: DateTime<Utc>,
    pub rem_minutes: i32,
    pub core_minutes: i32,
    pub deep_minutes: i32,
    pub awake_minutes: i32,
    pub unknown_minutes: i32,
    pub confidence: f64,
    pub source: String,
    pub epoch_minutes: f64,
}

/// Serde-friendly projection of `wellness_scoring::DailyWellnessScore`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyWellnessScoreDto {
    pub day_date: DateTime<Utc>,
    pub daily_balance: i32,
    pub load_pressure: i32,
    pub sleep_reserve_hours: f64,
    pub confidence: String,
    pub recommendation: String,
    pub detail: String,
}

/// All outputs from a full pipeline run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullDayOutput {
    pub sleep_detections: Vec<SleepDetectionSummaryV1>,
    pub activity_bouts: Vec<ActivityBoutV1>,
    pub sleep_stages: Vec<SleepStageSummaryDto>,
    pub night_features: Vec<NightFeatureSetV1>,
    pub baseline: BaselineProfileV1,
    pub daily_scores: Vec<DailyWellnessScoreDto>,
    pub daily_metrics: PersistedDailyMetricV1,
}

// ─────────────────────────── Orchestrator ──────────────────────────

const DEFAULT_TARGET_SLEEP_MINUTES: f64 = 8.0 * 60.0;

/// Run the complete 5-stage daily pipeline in-memory, returning every
/// intermediate and final result.  No DB, no async, no network — pure math.
pub fn compute_full_day(input: &FullDayInput) -> Result<FullDayOutput, ComputeError> {
    let tz: Option<chrono_tz::Tz> = input.time_zone.parse().ok();
    let window_end = compute_window_end(input);
    let device_event_pairs = to_event_pairs(&input.device_events);

    // ── Stage 1: Sleep Detect ───────────────────────────────────
    let historical_records = to_historical_records(&input.sensor_records);
    let off_wrist_intervals =
        sleep_detect::build_off_wrist_intervals(&device_event_pairs, window_end);
    let detections = sleep_detect::detect(&historical_records, tz, &off_wrist_intervals);

    // ── Stage 2: Activity Detect ────────────────────────────────
    let activity_records = to_activity_records(&input.sensor_records);
    let sleep_windows = to_sleep_windows(&detections);
    // No prior baseline on the device's first run — matches the server's
    // first-run behaviour where baseline_profiles is empty.
    let activity_baseline = activity_detect::BaselineProfile {
        resting_hr: 0.0,
        max_hr: None,
    };
    let off_wrist_lite = to_off_wrist_lite(&device_event_pairs, window_end);
    let bouts = activity_detect::detect_activities(
        &activity_records,
        &sleep_windows,
        activity_baseline,
        &off_wrist_lite,
    );

    // ── Stage 3: Sleep Stages ───────────────────────────────────
    let epoch_records = to_epoch_records(&input.sensor_records);
    let stage_detection_inputs = to_stage_detection_inputs(&detections);
    let stage_summaries = if stage_detection_inputs.is_empty() {
        Vec::new()
    } else {
        let median_hr = median_positive_hr(&epoch_records);
        let mut all_epochs = Vec::new();
        for d in &stage_detection_inputs {
            let epochs = epoch_features::extract_epoch_features(
                &epoch_records,
                d.bedtime,
                d.wake_time,
                median_hr,
                None,
            );
            all_epochs.extend(epochs);
        }
        sleep_stages::classify_sleep_stages(&all_epochs, &stage_detection_inputs)
    };

    // ── Stage 4: Wellness ───────────────────────────────────────
    let signal_samples = to_signal_samples(&input.samples);
    let sanitized = wellness_scoring::sanitize_signal_samples(&signal_samples);
    let wellness_dets = to_wellness_detections(&detections);
    let prior_baseline = wellness_scoring::BaselineProfile {
        resting_heart_rate: 0.0,
        rmssd: 0.0,
        sdnn: 0.0,
        nights_used: 0,
        is_warmed_up: false,
        max_heart_rate: None,
    };

    let mut computed_features: Vec<wellness_scoring::NightFeatureSet> =
        Vec::with_capacity(wellness_dets.len());
    for d in &wellness_dets {
        let opts = wellness_scoring::NightFeatureBuildOptions {
            bedtime: Some(d.bedtime),
            wake_time: Some(d.wake_time),
            continuity: Some(d.continuity),
            regularity: Some(d.regularity),
            valid_coverage: Some(d.valid_coverage),
            sleep_estimate_hours: Some(d.duration_hours),
            respiratory_rate: None,
        };
        let base = wellness_scoring::build_night_feature_set(
            &sanitized,
            d.night_date,
            prior_baseline,
            opts,
        );
        let eff = wellness_scoring::effective_sleep_feature_set(&base, Some(d));
        computed_features.push(eff);
    }
    computed_features.sort_by_key(|f| f.night_date);

    // Merge prior history with computed features for baseline & z-scores.
    // When a prior feature shares a night_date with a computed one, prefer
    // the freshly computed version.
    let prior_features: Vec<wellness_scoring::NightFeatureSet> = input
        .prior_night_features
        .iter()
        .map(from_night_feature_v1)
        .collect();
    let all_features = merge_features(prior_features, &computed_features);

    let recomputed_baseline = wellness_scoring::recompute_baseline_profile(&all_features);

    // Score only the reference day's computed features; prior nights are
    // history for the baseline/z-score, not re-scored.
    let daily_scores: Vec<wellness_scoring::DailyWellnessScore> = computed_features
        .iter()
        .map(|f| {
            wellness_scoring::compute_daily_score(
                f,
                recomputed_baseline,
                DEFAULT_TARGET_SLEEP_MINUTES,
                &all_features,
            )
        })
        .collect();

    // ── Stage 5: Derived Metrics ────────────────────────────────
    let nf_v1 = to_night_feature_v1s(&computed_features);
    let sd_v1 = to_sleep_detection_v1s(&detections);
    let merged_sd_v1 = merge_sleep_detections(&input.prior_sleep_detections, &sd_v1);
    let bl_v1 = to_baseline_v1(recomputed_baseline);

    let req = ComputeDerivedMetricsDayRequestV1 {
        schema_version: 1,
        samples: input.samples.clone(),
        sensor_records: input.sensor_records.clone(),
        night_features: nf_v1.clone(),
        sleep_detections: merged_sd_v1,
        baseline: bl_v1.clone(),
        reference_date: input.reference_date.clone(),
        time_zone: input.time_zone.clone(),
        desaturation_scope: DesaturationScope::ReferenceNight,
    };
    let daily_metrics = compute_derived_metrics(&req)?;

    // ── Assemble output ─────────────────────────────────────────
    Ok(FullDayOutput {
        sleep_detections: sd_v1,
        activity_bouts: to_activity_bout_v1s(&bouts),
        sleep_stages: to_sleep_stage_dtos(&stage_summaries),
        night_features: nf_v1,
        baseline: bl_v1,
        daily_scores: to_daily_score_dtos(&daily_scores),
        daily_metrics,
    })
}

// ───────────────────── Sensor → stage-input conversions ───────────

fn compute_window_end(input: &FullDayInput) -> DateTime<Utc> {
    let mut latest: Option<DateTime<Utc>> = None;
    for r in &input.sensor_records {
        latest = Some(latest.map_or(r.timestamp, |l| l.max(r.timestamp)));
    }
    for s in &input.samples {
        latest = Some(latest.map_or(s.timestamp, |l| l.max(s.timestamp)));
    }
    for e in &input.device_events {
        latest = Some(latest.map_or(e.captured_at, |l| l.max(e.captured_at)));
    }
    // Fallback: any timestamp will do — empty data means off-wrist
    // intervals are empty too, so the value is unused.
    latest.unwrap_or_else(Utc::now)
}

fn to_event_pairs(events: &[DeviceEventV1]) -> Vec<(i32, DateTime<Utc>)> {
    events
        .iter()
        .map(|e| (e.event_number, e.captured_at))
        .collect()
}

fn to_historical_records(
    records: &[HistoricalSensorRecordV1],
) -> Vec<sleep_detect::HistoricalRecord> {
    records
        .iter()
        .map(|r| sleep_detect::HistoricalRecord {
            timestamp: r.timestamp,
            heart_rate: r.heart_rate,
            gravity_magnitude: r.gravity_magnitude,
            gravity_x: r.gravity_x,
            gravity_y: r.gravity_y,
            gravity_z: r.gravity_z,
            skin_contact: r.skin_contact,
        })
        .collect()
}

fn to_activity_records(
    records: &[HistoricalSensorRecordV1],
) -> Vec<activity_detect::ActivityRecord> {
    records
        .iter()
        .map(|r| activity_detect::ActivityRecord {
            timestamp: r.timestamp,
            heart_rate: r.heart_rate,
            gravity_x: r.gravity_x,
            gravity_y: r.gravity_y,
            gravity_z: r.gravity_z,
        })
        .collect()
}

fn to_epoch_records(
    records: &[HistoricalSensorRecordV1],
) -> Vec<epoch_features::EpochSensorRecord> {
    records
        .iter()
        .map(|r| epoch_features::EpochSensorRecord {
            timestamp: r.timestamp,
            heart_rate: r.heart_rate,
            rr_average_ms: r.rr_average_ms,
            spo2_red: r.spo2_red,
            spo2_ir: r.spo2_ir,
            skin_temp_raw: r.skin_temp_raw,
            gravity_x: r.gravity_x,
            gravity_y: r.gravity_y,
            gravity_z: r.gravity_z,
            resp_rate_raw: r.resp_rate_raw,
            ambient_light: r.ambient_light,
            ppg_green: r.ppg_green,
            signal_quality: r.signal_quality,
            skin_contact: r.skin_contact,
        })
        .collect()
}

fn to_signal_samples(samples: &[SignalSampleV1]) -> Vec<wellness_scoring::SignalSample> {
    samples
        .iter()
        .map(|s| wellness_scoring::SignalSample {
            timestamp: s.timestamp,
            source: s.source.clone(),
            heart_rate: s.heart_rate,
            ibi_ms: s.ibi_ms,
            motion_score: s.motion_score,
            quality_score: s.quality_score,
        })
        .collect()
}

// ──────────── Inter-stage conversions (detection → next stage) ────

fn to_sleep_windows(
    detections: &[sleep_detect::SleepDetectionSummary],
) -> Vec<activity_detect::SleepWindow> {
    detections
        .iter()
        .map(|d| activity_detect::SleepWindow {
            bedtime: d.bedtime,
            wake_time: d.wake_time,
        })
        .collect()
}

/// Replicate the activity_detect stage's `build_off_wrist` helper: reuse
/// `sleep_detect::build_off_wrist_intervals` then attach a source label
/// by matching the interval start against the event that opened it.
fn to_off_wrist_lite(
    events: &[(i32, DateTime<Utc>)],
    window_end: DateTime<Utc>,
) -> Vec<activity_detect::OffWristIntervalLite> {
    let intervals = sleep_detect::build_off_wrist_intervals(events, window_end);
    intervals
        .into_iter()
        .map(|i| {
            let source = events
                .iter()
                .find(|(_, ts)| *ts == i.start)
                .and_then(|(n, _)| match n {
                    7 | 9 => Some(activity_detect::OffWristSource::WristOff),
                    8 | 10 => Some(activity_detect::OffWristSource::ChargingOn),
                    _ => None,
                });
            activity_detect::OffWristIntervalLite {
                start: i.start,
                end: i.end,
                source,
            }
        })
        .collect()
}

fn to_stage_detection_inputs(
    detections: &[sleep_detect::SleepDetectionSummary],
) -> Vec<sleep_stages::SleepDetectionInput> {
    detections
        .iter()
        .map(|d| sleep_stages::SleepDetectionInput {
            night_date: d.night_date,
            bedtime: d.bedtime,
            wake_time: d.wake_time,
            confidence: d.confidence,
        })
        .collect()
}

fn to_wellness_detections(
    detections: &[sleep_detect::SleepDetectionSummary],
) -> Vec<wellness_scoring::SleepDetectionSummary> {
    detections
        .iter()
        .map(|d| wellness_scoring::SleepDetectionSummary {
            night_date: d.night_date,
            bedtime: d.bedtime,
            wake_time: d.wake_time,
            continuity: d.continuity,
            regularity: d.regularity,
            valid_coverage: d.valid_coverage,
            duration_hours: d.duration_hours,
            confidence: d.confidence,
        })
        .collect()
}

/// Median of positive heart-rate values across all sensor records.
/// Matches the `median_positive_hr` helper in the sleep_stages stage.
fn median_positive_hr(records: &[epoch_features::EpochSensorRecord]) -> f64 {
    let mut hrs: Vec<f64> = records
        .iter()
        .map(|r| r.heart_rate)
        .filter(|v| *v > 0.0)
        .collect();
    if hrs.is_empty() {
        return 60.0;
    }
    hrs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    hrs[hrs.len() / 2]
}

// ───────────── Stage-output → V1/DTO conversions ─────────────────

fn to_sleep_detection_v1s(
    detections: &[sleep_detect::SleepDetectionSummary],
) -> Vec<SleepDetectionSummaryV1> {
    detections
        .iter()
        .map(|d| SleepDetectionSummaryV1 {
            night_date: d.night_date,
            bedtime: d.bedtime,
            wake_time: d.wake_time,
            duration_hours: d.duration_hours,
            interruption_count: d.interruption_count as f64,
            continuity: d.continuity,
            regularity: d.regularity,
            valid_coverage: d.valid_coverage,
            confidence: d.confidence,
        })
        .collect()
}

fn to_activity_bout_v1s(bouts: &[activity_detect::ActivityBout]) -> Vec<ActivityBoutV1> {
    bouts
        .iter()
        .map(|b| ActivityBoutV1 {
            start_time: b.start_time,
            end_time: b.end_time,
            duration_minutes: b.duration_minutes,
            activity_type: b.activity_type.clone(),
            intensity: b.intensity.as_str().to_owned(),
            confidence: b.confidence,
            heart_rate_avg: b.heart_rate_avg,
            heart_rate_max: b.heart_rate_max,
            strain_score: b.strain_score,
            source: b.source.as_str().to_owned(),
            cadence_hz: b.cadence_hz,
            flights_count: None,
            elevation_gain_meters: None,
            distance_meters: None,
            external_source: b.external_source.clone(),
        })
        .collect()
}

fn to_sleep_stage_dtos(summaries: &[sleep_stages::SleepStageSummary]) -> Vec<SleepStageSummaryDto> {
    summaries
        .iter()
        .map(|s| SleepStageSummaryDto {
            night_date: s.night_date,
            rem_minutes: s.rem_minutes,
            core_minutes: s.core_minutes,
            deep_minutes: s.deep_minutes,
            awake_minutes: s.awake_minutes,
            unknown_minutes: s.unknown_minutes,
            confidence: s.confidence,
            source: s.source.to_owned(),
            epoch_minutes: s.epoch_minutes,
        })
        .collect()
}

fn to_night_feature_v1s(features: &[wellness_scoring::NightFeatureSet]) -> Vec<NightFeatureSetV1> {
    features
        .iter()
        .map(|f| NightFeatureSetV1 {
            night_date: f.night_date,
            resting_heart_rate: f.resting_heart_rate,
            rmssd: f.rmssd,
            sdnn: f.sdnn,
            pnn50: f.pnn50,
            respiratory_rate: f.respiratory_rate,
            continuity: f.continuity,
            regularity: f.regularity,
            valid_coverage: f.valid_coverage,
            confidence_raw: f.confidence_raw,
            sleep_estimate_hours: f.sleep_estimate_hours,
            source_blend: f.source_blend.clone(),
        })
        .collect()
}

fn from_night_feature_v1(v: &NightFeatureSetV1) -> wellness_scoring::NightFeatureSet {
    wellness_scoring::NightFeatureSet {
        night_date: v.night_date,
        resting_heart_rate: v.resting_heart_rate,
        rmssd: v.rmssd,
        sdnn: v.sdnn,
        pnn50: v.pnn50,
        respiratory_rate: v.respiratory_rate,
        continuity: v.continuity,
        regularity: v.regularity,
        valid_coverage: v.valid_coverage,
        confidence_raw: v.confidence_raw,
        sleep_estimate_hours: v.sleep_estimate_hours,
        source_blend: v.source_blend.clone(),
    }
}

/// Merge prior night-features with freshly computed features.  If a prior
/// feature shares a `night_date` with a computed one, the computed version
/// wins.  The returned vec is sorted by `night_date`.
fn merge_features(
    prior: Vec<wellness_scoring::NightFeatureSet>,
    computed: &[wellness_scoring::NightFeatureSet],
) -> Vec<wellness_scoring::NightFeatureSet> {
    use std::collections::HashSet;
    let computed_dates: HashSet<i64> = computed.iter().map(|f| f.night_date.timestamp()).collect();
    let mut merged: Vec<wellness_scoring::NightFeatureSet> = prior
        .into_iter()
        .filter(|f| !computed_dates.contains(&f.night_date.timestamp()))
        .collect();
    merged.extend(computed.iter().cloned());
    merged.sort_by_key(|f| f.night_date);
    merged
}

/// Merge prior sleep-detection summaries with the freshly computed
/// detections.  If a prior entry shares a `night_date` with a computed
/// one, the computed version wins.  The returned vec is sorted ascending
/// by `night_date`.
fn merge_sleep_detections(
    prior: &[SleepDetectionSummaryV1],
    computed: &[SleepDetectionSummaryV1],
) -> Vec<SleepDetectionSummaryV1> {
    use std::collections::HashSet;
    let computed_dates: HashSet<i64> = computed.iter().map(|d| d.night_date.timestamp()).collect();
    let mut merged: Vec<SleepDetectionSummaryV1> = prior
        .iter()
        .filter(|d| !computed_dates.contains(&d.night_date.timestamp()))
        .cloned()
        .collect();
    merged.extend(computed.iter().cloned());
    merged.sort_by_key(|d| d.night_date);
    merged
}

fn to_baseline_v1(b: wellness_scoring::BaselineProfile) -> BaselineProfileV1 {
    BaselineProfileV1 {
        resting_heart_rate: b.resting_heart_rate,
        rmssd: b.rmssd,
        sdnn: b.sdnn,
        nights_used: b.nights_used as f64,
        is_warmed_up: b.is_warmed_up,
        max_heart_rate: b.max_heart_rate,
    }
}

fn to_daily_score_dtos(
    scores: &[wellness_scoring::DailyWellnessScore],
) -> Vec<DailyWellnessScoreDto> {
    scores
        .iter()
        .map(|s| DailyWellnessScoreDto {
            day_date: s.day_date,
            daily_balance: s.daily_balance,
            load_pressure: s.load_pressure,
            sleep_reserve_hours: s.sleep_reserve_hours,
            confidence: s.confidence.as_str().to_owned(),
            recommendation: s.recommendation.as_str().to_owned(),
            detail: s.detail.clone(),
        })
        .collect()
}
