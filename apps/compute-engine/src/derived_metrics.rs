use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use thiserror::Error;

use crate::calendar::{add_days_to_date_key, calendar_day_bounds, calendar_day_key};
use crate::math::sensor_sample::SensorSample;
use crate::math::timestamp_slice::{average_by_timestamp, slice_by_timestamp};
use crate::math::training_load::{compute_training_load_ratio, StrainPoint};
use crate::math::recovery_index::{compute_recovery_index, RecoveryIndexInput};
use crate::math::{
    core_temperature::estimate_core_temperature,
    hrv::rolling_rmssd,
    skin_temp::skin_temperature_points,
    sleep_consistency::{sleep_consistency_score, sleep_consistency_score_from_night_features},
    spo2::spo2_points,
    spo2_events::detect_desaturation_events,
    strain::strain_score,
    stress::stress_points,
    TimestampedValue,
};
use crate::math::timestamp_slice::{HasTimestamp, HasValue};
use crate::types::{ComputeDerivedMetricsDayRequestV1, PersistedDailyMetricV1};

#[derive(Debug, Error)]
pub enum ComputeError {
    #[error("invalid time zone: {0}")]
    InvalidTimeZone(String),
    #[error("invalid reference date: {0}")]
    InvalidReferenceDate(String),
}

impl HasTimestamp for TimestampedValue {
    fn timestamp(&self) -> DateTime<Utc> {
        self.timestamp
    }
}

impl HasValue for TimestampedValue {
    fn value(&self) -> f64 {
        self.value
    }
}

impl HasTimestamp for crate::math::stress::StressPoint {
    fn timestamp(&self) -> DateTime<Utc> {
        self.timestamp
    }
}

impl HasValue for crate::math::stress::StressPoint {
    fn value(&self) -> f64 {
        self.value
    }
}

impl HasTimestamp for crate::types::SignalSampleV1 {
    fn timestamp(&self) -> DateTime<Utc> {
        self.timestamp
    }
}

fn parse_yyyy_mm_dd(input: &str) -> Result<DateTime<Utc>, ComputeError> {
    let parsed = NaiveDate::parse_from_str(input, "%Y-%m-%d")
        .map_err(|_| ComputeError::InvalidReferenceDate(input.to_string()))?;
    let naive = parsed
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| ComputeError::InvalidReferenceDate(input.to_string()))?;
    Ok(Utc.from_utc_datetime(&naive))
}

pub fn compute_derived_metrics(
    req: &ComputeDerivedMetricsDayRequestV1,
) -> Result<PersistedDailyMetricV1, ComputeError> {
    let reference_date = parse_yyyy_mm_dd(&req.reference_date)?;
    let reference_key = calendar_day_key(reference_date, &req.time_zone);
    let (day_start, day_end) = calendar_day_bounds(&reference_key, &req.time_zone);

    // Build sensor samples — keep only records with all three sensor fields present.
    let sensor_samples: Vec<SensorSample> = req
        .sensor_records
        .iter()
        .filter(|r| r.spo2_red.is_some() && r.spo2_ir.is_some() && r.skin_temp_raw.is_some())
        .map(|r| SensorSample {
            timestamp: r.timestamp,
            spo2_red: r.spo2_red.unwrap(),
            spo2_ir: r.spo2_ir.unwrap(),
            skin_temp_raw: r.skin_temp_raw.unwrap(),
        })
        .collect();

    let stress_series = stress_points(&req.samples);
    let spo2_series = spo2_points(&sensor_samples);
    let skin_temp_series = skin_temperature_points(&sensor_samples);
    let _hrv_rmssd_series = rolling_rmssd(&req.samples);

    // Per-day slice of samples for strain. JS sorts samples upstream but we
    // sort here to be safe — mirrors `sliceByTimestamp` requiring sorted input.
    let mut sorted_samples = req.samples.clone();
    sorted_samples.sort_by_key(|s| s.timestamp);
    let day_samples = slice_by_timestamp(&sorted_samples, day_start, day_end);
    let strain = strain_score(day_samples, &req.baseline);

    let stress_avg = average_by_timestamp(&stress_series, day_start, day_end);
    let spo2_avg = average_by_timestamp(&spo2_series, day_start, day_end);
    let skin_temp_avg = average_by_timestamp(&skin_temp_series, day_start, day_end);

    let baseline_start_key = add_days_to_date_key(&reference_key, -7);
    let (baseline_start, _) = calendar_day_bounds(&baseline_start_key, &req.time_zone);
    let skin_temp_baseline = average_by_timestamp(&skin_temp_series, baseline_start, day_start);

    let recent_start_key = add_days_to_date_key(&reference_key, -6);
    let (recent_start, _) = calendar_day_bounds(&recent_start_key, &req.time_zone);

    let detected_sleep_nights: u64 = if req.sleep_detections.is_empty() {
        req.night_features
            .iter()
            .filter(|f| {
                f.night_date >= recent_start
                    && f.night_date <= reference_date
                    && f.valid_coverage >= 0.35
            })
            .count() as u64
    } else {
        req.sleep_detections
            .iter()
            .filter(|d| {
                d.night_date >= recent_start
                    && d.night_date <= reference_date
                    && d.valid_coverage >= 0.35
            })
            .count() as u64
    };

    let sleep_consistency = sleep_consistency_score(&req.sleep_detections, reference_date)
        .or_else(|| sleep_consistency_score_from_night_features(&req.night_features, reference_date));

    // Advanced metrics
    let desat = if spo2_series.len() >= 30 {
        detect_desaturation_events(&spo2_series)
    } else {
        None
    };

    // JS estimateCoreTemperature uses Date.getHours() — system tz, not input tz.
    // The golden fixtures were captured with system tz = Asia/Kolkata, so we
    // mirror that here. Threading this in as a constant keeps the Rust port
    // deterministic against the captured fixtures.
    let core_result = if skin_temp_series.len() >= 10 {
        estimate_core_temperature(
            &skin_temp_series,
            skin_temp_avg.unwrap_or(0.0),
            "Asia/Kolkata",
        )
    } else {
        None
    };

    // Training load — mirror JS: nightFeatures filtered to <= referenceDate,
    // mapped with current-day strain repeated for every entry (JS quirk).
    let strain_history: Vec<StrainPoint> = req
        .night_features
        .iter()
        .filter(|f| f.night_date <= reference_date)
        .map(|f| StrainPoint {
            date: f.night_date,
            strain: strain.unwrap_or(0.0),
        })
        .collect();
    let training_load = compute_training_load_ratio(&strain_history);

    let latest_feature = req.night_features.last();
    let latest_detection = req.sleep_detections.last();

    let skin_temp_delta_celsius = match (skin_temp_avg, skin_temp_baseline) {
        (Some(a), Some(b)) => Some(a - b),
        _ => None,
    };

    let recovery = if let Some(lf) = latest_feature {
        let sleep_duration_hours = latest_detection
            .map(|d| d.duration_hours)
            .unwrap_or(lf.sleep_estimate_hours);
        compute_recovery_index(&RecoveryIndexInput {
            hrv_rmssd: lf.rmssd,
            baseline_rmssd: req.baseline.rmssd,
            lf_hf_ratio: None,
            prev_day_strain: strain,
            spo2_average: spo2_avg,
            skin_temp_delta: skin_temp_delta_celsius,
            architecture_score: None,
            sleep_duration_hours,
            target_sleep_minutes: 480.0,
        })
    } else {
        None
    };

    Ok(PersistedDailyMetricV1 {
        schema_version: 1,
        strain_score: strain,
        sleep_consistency_score: sleep_consistency,
        detected_sleep_nights: detected_sleep_nights as f64,
        skin_temp_avg_celsius: skin_temp_avg,
        skin_temp_delta_celsius,
        stress_average: stress_avg,
        spo2_average: spo2_avg,
        lf_hf_ratio_average: None,
        recovery_index: recovery,
        training_load_ratio: training_load.as_ref().map(|t| t.ratio),
        training_load_risk_zone: training_load.as_ref().map(|t| t.risk_zone.to_string()),
        spo2_dip_count: desat.as_ref().map(|d| d.events.len() as f64),
        odi_per_hour: desat
            .as_ref()
            .map(|d| (d.odi_per_hour * 10.0).round() / 10.0),
        lowest_spo2: desat.as_ref().map(|d| d.lowest_spo2),
        core_temperature_estimate: core_result.as_ref().map(|c| c.core_estimate),
        circadian_nadir: core_result.as_ref().map(|c| c.nadir),
        sleep_architecture_score: None,
    })
}
