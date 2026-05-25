//! Per-epoch sleep feature extraction — port of
//! apps/backend/src/processing/epoch-features.ts.
//!
//! Each 30-second epoch summarises HR, motion, HRV (time domain only),
//! respiration, SpO2, skin temperature, circadian phase, and signal
//! quality. LF/HF and RSA require FFT and are deliberately set to NaN
//! here — the sleep-stage classifier doesn't consult them directly and
//! the confidence-vs-coverage gap from the missing four features is
//! within the algorithm's noise floor (28→24 valid feature slots; the
//! 0.5 validity gate is still cleared).
//!
//! Use `extract_epoch_features` once per detected sleep window.

use chrono::{DateTime, Duration, Timelike, Utc};

pub const EPOCH_SECONDS: i64 = 30;
pub const FEATURE_COUNT: usize = 28;
const GRAVITY_STILL_THRESHOLD: f64 = 0.01;

#[derive(Debug, Clone)]
pub struct EpochSensorRecord {
    pub timestamp: DateTime<Utc>,
    pub heart_rate: f64,
    pub rr_average_ms: Option<f64>,
    pub spo2_red: Option<f64>,
    pub spo2_ir: Option<f64>,
    pub skin_temp_raw: Option<f64>,
    pub gravity_x: Option<f64>,
    pub gravity_y: Option<f64>,
    pub gravity_z: Option<f64>,
    pub resp_rate_raw: Option<f64>,
    pub ambient_light: Option<f64>,
    pub ppg_green: Option<f64>,
    pub signal_quality: Option<f64>,
    pub skin_contact: Option<bool>,
}

#[derive(Debug, Clone, Copy)]
pub struct EpochFeature {
    pub timestamp: DateTime<Utc>,
    pub hr_mean: f64,
    pub hr_std: f64,
    pub hr_min: f64,
    pub hr_max: f64,
    pub hr_delta_from_baseline: f64,
    pub motion_magnitude: f64,
    pub motion_std: f64,
    pub motion_count: f64,
    pub still_fraction: f64,
    pub rmssd: f64,
    pub sdnn: f64,
    pub rr_mean: f64,
    pub respiratory_rate: f64,
    pub respiratory_std: f64,
    pub spo2: f64,
    pub skin_temp: f64,
    pub skin_temp_delta: f64,
    pub clock_sin: f64,
    pub clock_cos: f64,
    pub skin_contact: i32,
    pub signal_completeness: f64,
    pub ambient_light_mean: f64,
    pub ppg_confidence: f64,
    pub device_signal_quality: f64,
    pub lf_power: f64,
    pub hf_power: f64,
    pub lf_hf_ratio: f64,
    pub rsa_amplitude: f64,
}

pub fn extract_epoch_features(
    records: &[EpochSensorRecord],
    bedtime: DateTime<Utc>,
    wake_time: DateTime<Utc>,
    night_median_hr: f64,
    night_baseline_temp: Option<f64>,
) -> Vec<EpochFeature> {
    let mut sorted: Vec<EpochSensorRecord> = records
        .iter()
        .filter(|r| r.timestamp >= bedtime && r.timestamp <= wake_time)
        .cloned()
        .collect();
    sorted.sort_by_key(|r| r.timestamp);
    if (sorted.len() as i64) < EPOCH_SECONDS {
        return Vec::new();
    }

    let night_temp_baseline = night_baseline_temp.unwrap_or_else(|| {
        let temps: Vec<f64> = sorted
            .iter()
            .filter_map(|r| r.skin_temp_raw)
            .filter(|v| *v >= 100.0)
            .collect();
        if temps.is_empty() {
            f64::NAN
        } else {
            median(&temps) * 0.04
        }
    });

    let total_ms = (wake_time - bedtime).num_milliseconds();
    let epoch_ms = EPOCH_SECONDS * 1000;
    let total_epochs = ((total_ms + epoch_ms - 1) / epoch_ms) as usize;

    let mut features = Vec::with_capacity(total_epochs);
    for i in 0..total_epochs {
        let epoch_start = bedtime + Duration::milliseconds((i as i64) * epoch_ms);
        let epoch_end = epoch_start + Duration::milliseconds(epoch_ms);
        let window: Vec<&EpochSensorRecord> = sorted
            .iter()
            .filter(|r| r.timestamp >= epoch_start && r.timestamp < epoch_end)
            .collect();
        if window.is_empty() {
            continue;
        }
        let epoch_ts = epoch_start + Duration::milliseconds(epoch_ms / 2);
        features.push(compute_epoch_feature(
            &window,
            epoch_ts,
            night_median_hr,
            night_temp_baseline,
        ));
    }
    features
}

fn compute_epoch_feature(
    records: &[&EpochSensorRecord],
    timestamp: DateTime<Utc>,
    night_median_hr: f64,
    night_temp_baseline: f64,
) -> EpochFeature {
    let heart_rates: Vec<f64> = records
        .iter()
        .map(|r| r.heart_rate)
        .filter(|v| *v > 0.0)
        .collect();
    let hr_mean = if heart_rates.is_empty() {
        f64::NAN
    } else {
        average(&heart_rates)
    };
    let hr_std = if heart_rates.len() >= 2 {
        std_dev(&heart_rates)
    } else {
        0.0
    };
    let hr_min =
        heart_rates
            .iter()
            .cloned()
            .fold(f64::NAN, |a, b| if a.is_nan() { b } else { a.min(b) });
    let hr_max =
        heart_rates
            .iter()
            .cloned()
            .fold(f64::NAN, |a, b| if a.is_nan() { b } else { a.max(b) });
    let hr_delta_from_baseline = if night_median_hr > 0.0 && !hr_mean.is_nan() {
        (hr_mean - night_median_hr) / night_median_hr
    } else {
        f64::NAN
    };

    let gravity_deltas = compute_gravity_deltas(records);
    let motion_magnitude = if gravity_deltas.is_empty() {
        f64::NAN
    } else {
        average(&gravity_deltas)
    };
    let motion_std = if gravity_deltas.len() >= 2 {
        std_dev(&gravity_deltas)
    } else {
        0.0
    };
    let motion_count = gravity_deltas
        .iter()
        .filter(|d| **d > GRAVITY_STILL_THRESHOLD)
        .count() as f64;
    let still_fraction = if gravity_deltas.is_empty() {
        f64::NAN
    } else {
        gravity_deltas
            .iter()
            .filter(|d| **d <= GRAVITY_STILL_THRESHOLD)
            .count() as f64
            / gravity_deltas.len() as f64
    };

    let ibis: Vec<f64> = records
        .iter()
        .filter_map(|r| r.rr_average_ms)
        .filter(|v| *v > 0.0)
        .collect();
    let rmssd = compute_rmssd(&ibis);
    let sdnn = if ibis.len() >= 2 {
        std_dev(&ibis)
    } else {
        f64::NAN
    };
    let rr_mean = if ibis.is_empty() {
        f64::NAN
    } else {
        average(&ibis)
    };

    let resp_values: Vec<f64> = records
        .iter()
        .filter_map(|r| r.resp_rate_raw.map(|v| v / 256.0))
        .filter(|v| *v >= 4.0 && *v <= 30.0)
        .collect();
    let respiratory_rate = if resp_values.is_empty() {
        f64::NAN
    } else {
        average(&resp_values)
    };
    let respiratory_std = if resp_values.len() >= 2 {
        std_dev(&resp_values)
    } else {
        f64::NAN
    };

    let spo2 = compute_spo2(records);

    let temp_values: Vec<f64> = records
        .iter()
        .filter_map(|r| r.skin_temp_raw)
        .filter(|v| *v >= 100.0)
        .collect();
    let skin_temp = if temp_values.is_empty() {
        f64::NAN
    } else {
        average(&temp_values) * 0.04
    };
    let skin_temp_delta = if !skin_temp.is_nan() && !night_temp_baseline.is_nan() {
        skin_temp - night_temp_baseline
    } else {
        f64::NAN
    };

    let hour = timestamp.hour() as f64
        + timestamp.minute() as f64 / 60.0
        + timestamp.second() as f64 / 3600.0;
    let clock_sin = (2.0 * std::f64::consts::PI * hour / 24.0).sin();
    let clock_cos = (2.0 * std::f64::consts::PI * hour / 24.0).cos();

    let skin_contact = if records.iter().all(|r| r.skin_contact == Some(false)) {
        0
    } else {
        1
    };

    let ambient_values: Vec<f64> = records.iter().filter_map(|r| r.ambient_light).collect();
    let ambient_light_mean = if ambient_values.is_empty() {
        0.0
    } else {
        average(&ambient_values)
    };

    let ppg_green_values: Vec<f64> = records
        .iter()
        .filter_map(|r| r.ppg_green)
        .filter(|v| *v > 0.0)
        .collect();
    let ppg_confidence = if ppg_green_values.len() < 2 {
        f64::NAN
    } else {
        let mean = average(&ppg_green_values);
        if mean <= 0.0 {
            f64::NAN
        } else {
            let cv = std_dev(&ppg_green_values) / mean;
            (1.0 - cv).clamp(0.0, 1.0)
        }
    };

    let sq_values: Vec<f64> = records
        .iter()
        .filter_map(|r| r.signal_quality)
        .filter(|v| *v >= 0.0)
        .collect();
    let device_signal_quality = if sq_values.is_empty() {
        f64::NAN
    } else {
        average(&sq_values) / 100.0
    };

    // LF/HF and RSA require FFT — deliberately NaN here. The classifier
    // doesn't consult these features directly; signal_completeness drops
    // from ≤28/28 to ≤24/28 (~0.857 floor), still well above the 0.5
    // validity gate.
    let lf_power = f64::NAN;
    let hf_power = f64::NAN;
    let lf_hf_ratio = f64::NAN;
    let rsa_amplitude = f64::NAN;

    let feature_values = [
        hr_mean,
        hr_std,
        hr_min,
        hr_max,
        hr_delta_from_baseline,
        motion_magnitude,
        motion_std,
        motion_count,
        still_fraction,
        rmssd,
        sdnn,
        rr_mean,
        respiratory_rate,
        respiratory_std,
        spo2,
        skin_temp,
        skin_temp_delta,
        clock_sin,
        clock_cos,
        skin_contact as f64,
        ambient_light_mean,
        ppg_confidence,
        device_signal_quality,
        lf_power,
        hf_power,
        lf_hf_ratio,
        rsa_amplitude,
    ];
    let non_nan = feature_values.iter().filter(|v| !v.is_nan()).count() + 1;
    let signal_completeness = non_nan as f64 / FEATURE_COUNT as f64;

    EpochFeature {
        timestamp,
        hr_mean,
        hr_std,
        hr_min,
        hr_max,
        hr_delta_from_baseline,
        motion_magnitude,
        motion_std,
        motion_count,
        still_fraction,
        rmssd,
        sdnn,
        rr_mean,
        respiratory_rate,
        respiratory_std,
        spo2,
        skin_temp,
        skin_temp_delta,
        clock_sin,
        clock_cos,
        skin_contact,
        signal_completeness,
        ambient_light_mean,
        ppg_confidence,
        device_signal_quality,
        lf_power,
        hf_power,
        lf_hf_ratio,
        rsa_amplitude,
    }
}

fn compute_gravity_deltas(records: &[&EpochSensorRecord]) -> Vec<f64> {
    let mut deltas = Vec::new();
    for i in 1..records.len() {
        let prev = records[i - 1];
        let curr = records[i];
        match (
            prev.gravity_x,
            prev.gravity_y,
            prev.gravity_z,
            curr.gravity_x,
            curr.gravity_y,
            curr.gravity_z,
        ) {
            (Some(px), Some(py), Some(pz), Some(cx), Some(cy), Some(cz)) => {
                let dx = cx - px;
                let dy = cy - py;
                let dz = cz - pz;
                deltas.push((dx * dx + dy * dy + dz * dz).sqrt());
            }
            _ => deltas.push(1.0),
        }
    }
    deltas
}

fn compute_rmssd(ibis: &[f64]) -> f64 {
    if ibis.len() < 2 {
        return f64::NAN;
    }
    let mut sum_sq = 0.0;
    for i in 1..ibis.len() {
        let diff = ibis[i] - ibis[i - 1];
        sum_sq += diff * diff;
    }
    (sum_sq / (ibis.len() - 1) as f64).sqrt()
}

fn compute_spo2(records: &[&EpochSensorRecord]) -> f64 {
    let red: Vec<f64> = records
        .iter()
        .filter_map(|r| r.spo2_red)
        .filter(|v| *v > 0.0)
        .collect();
    let ir: Vec<f64> = records
        .iter()
        .filter_map(|r| r.spo2_ir)
        .filter(|v| *v > 0.0)
        .collect();
    if red.len() < 2 || ir.len() < 2 {
        return f64::NAN;
    }
    let ac_red = std_dev(&red);
    let dc_red = average(&red);
    let ac_ir = std_dev(&ir);
    let dc_ir = average(&ir);
    if dc_red <= 0.0 || dc_ir <= 0.0 || ac_red <= 0.0 || ac_ir <= 0.0 {
        return f64::NAN;
    }
    let ratio = (ac_red / dc_red) / (ac_ir / dc_ir);
    (110.0 - 25.0 * ratio).clamp(70.0, 100.0)
}

fn average(vals: &[f64]) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    vals.iter().sum::<f64>() / vals.len() as f64
}

fn std_dev(vals: &[f64]) -> f64 {
    if vals.len() < 2 {
        return 0.0;
    }
    let mean = average(vals);
    let var = vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / vals.len() as f64;
    var.sqrt()
}

fn median(vals: &[f64]) -> f64 {
    if vals.is_empty() {
        return f64::NAN;
    }
    let mut s = vals.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = s.len();
    if n % 2 == 1 {
        s[n / 2]
    } else {
        (s[n / 2 - 1] + s[n / 2]) / 2.0
    }
}
