//! Wellness scoring — port of apps/backend/src/processing/wellness-scoring.ts.
//!
//! Three connected functions in one file:
//!   1. `build_night_feature_set` — per-night HR/HRV/respiration/coverage features
//!   2. `effective_sleep_feature_set` — blend a NightFeatureSet with the matching
//!      SleepDetectionSummary, raising confidence on agreement, lowering on
//!      disagreement
//!   3. `recompute_baseline_profile` — average resting HR / RMSSD / SDNN
//!      across a user's valid nights, derive maxHeartRate from the highest
//!      resting HR
//!   4. `compute_daily_score` — z-score-based daily balance vs the user's own
//!      rolling 60-night baseline; falls back to continuity/regularity when
//!      history is too short
//!
//! Plus a `sanitize_signal_samples` helper that drops out-of-range or
//! poor-quality samples — mirrors ppg-quality-gate.ts.

use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone)]
pub struct SignalSample {
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub heart_rate: f64,
    pub ibi_ms: Option<f64>,
    pub motion_score: Option<f64>,
    pub quality_score: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct BaselineProfile {
    pub resting_heart_rate: f64,
    pub rmssd: f64,
    pub sdnn: f64,
    pub nights_used: i32,
    pub is_warmed_up: bool,
    pub max_heart_rate: Option<f64>,
}

#[derive(Debug, Clone, Copy)]
pub struct SleepDetectionSummary {
    pub night_date: DateTime<Utc>,
    pub bedtime: DateTime<Utc>,
    pub wake_time: DateTime<Utc>,
    pub continuity: f64,
    pub regularity: f64,
    pub valid_coverage: f64,
    pub duration_hours: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone)]
pub struct NightFeatureSet {
    pub night_date: DateTime<Utc>,
    pub resting_heart_rate: f64,
    pub rmssd: f64,
    pub sdnn: f64,
    pub pnn50: f64,
    pub respiratory_rate: f64,
    pub continuity: f64,
    pub regularity: f64,
    pub valid_coverage: f64,
    pub confidence_raw: f64,
    pub sleep_estimate_hours: f64,
    pub source_blend: String,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NightFeatureBuildOptions {
    pub bedtime: Option<DateTime<Utc>>,
    pub wake_time: Option<DateTime<Utc>>,
    pub continuity: Option<f64>,
    pub regularity: Option<f64>,
    pub valid_coverage: Option<f64>,
    pub sleep_estimate_hours: Option<f64>,
    pub respiratory_rate: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Recommendation {
    Restore,
    Steady,
    Build,
}

impl Recommendation {
    pub fn as_str(&self) -> &'static str {
        match self {
            Recommendation::Restore => "Restore",
            Recommendation::Steady => "Steady",
            Recommendation::Build => "Build",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Confidence {
    Low,
    Medium,
    High,
}

impl Confidence {
    pub fn as_str(&self) -> &'static str {
        match self {
            Confidence::Low => "Low",
            Confidence::Medium => "Medium",
            Confidence::High => "High",
        }
    }
}

#[derive(Debug, Clone)]
pub struct DailyWellnessScore {
    pub day_date: DateTime<Utc>,
    pub daily_balance: i32,
    pub load_pressure: i32,
    pub sleep_reserve_hours: f64,
    pub confidence: Confidence,
    pub recommendation: Recommendation,
    pub detail: String,
}

pub fn sanitize_signal_samples(samples: &[SignalSample]) -> Vec<SignalSample> {
    samples
        .iter()
        .filter(|s| s.heart_rate >= 35.0 && s.heart_rate <= 210.0)
        .filter(|s| match s.ibi_ms {
            Some(ibi) => (250.0..=2000.0).contains(&ibi),
            None => true,
        })
        .filter(|s| match s.motion_score {
            Some(m) => m <= 0.65,
            None => true,
        })
        .map(|s| SignalSample {
            quality_score: s.quality_score.clamp(0.0, 1.0),
            ..s.clone()
        })
        .filter(|s| s.quality_score >= 0.35)
        .collect()
}

pub fn build_night_feature_set(
    samples: &[SignalSample],
    reference_date: DateTime<Utc>,
    baseline: BaselineProfile,
    options: NightFeatureBuildOptions,
) -> NightFeatureSet {
    let window_start = options
        .bedtime
        .unwrap_or_else(|| reference_date - chrono::Duration::hours(12));
    let window_end = options.wake_time.unwrap_or(reference_date);

    let night: Vec<&SignalSample> = samples
        .iter()
        .filter(|s| s.timestamp >= window_start && s.timestamp <= window_end)
        .collect();

    let expected = estimate_expected_samples(&night, window_start, window_end);
    let detected_coverage = if expected <= 0.0 {
        0.0
    } else {
        (night.len() as f64 / expected).min(1.0)
    };
    let valid_coverage = options
        .valid_coverage
        .unwrap_or(detected_coverage)
        .clamp(0.0, 1.0);

    let heart_rates: Vec<f64> = night.iter().map(|s| s.heart_rate).collect();
    let ibis: Vec<f64> = night
        .iter()
        .map(|s| s.ibi_ms.unwrap_or(60_000.0 / s.heart_rate))
        .collect();

    let resting_heart_rate = if heart_rates.is_empty() {
        0.0
    } else {
        percentile(&heart_rates, 0.15)
    };

    let rmssd = compute_rmssd(&ibis);
    let sdnn = if ibis.len() >= 2 { std_dev(&ibis) } else { 0.0 };
    let pnn50 = compute_pnn50(&ibis);

    let hr_std_dev = if heart_rates.len() >= 2 {
        std_dev(&heart_rates)
    } else {
        0.0
    };
    let respiratory_rate = match options.respiratory_rate {
        Some(v) if v.is_finite() => v.clamp(6.0, 30.0),
        _ => (14.0 + hr_std_dev * 0.65).clamp(10.0, 22.0),
    };

    let continuity = options
        .continuity
        .unwrap_or_else(|| estimate_continuity(&night))
        .clamp(0.0, 1.0);

    let regularity = options
        .regularity
        .unwrap_or_else(|| {
            if baseline.nights_used == 0 {
                0.65
            } else {
                (1.0 - (resting_heart_rate - baseline.resting_heart_rate).abs() / 25.0).max(0.0)
            }
        })
        .clamp(0.0, 1.0);

    let avg_quality = if night.is_empty() {
        0.0
    } else {
        night.iter().map(|s| s.quality_score).sum::<f64>() / night.len() as f64
    };
    let confidence_raw = (valid_coverage * 0.6 + avg_quality * 0.4).min(1.0);

    let observed_window_hours =
        ((window_end - window_start).num_milliseconds() as f64 / 3_600_000.0).max(0.0);
    let sleep_estimate_hours = options
        .sleep_estimate_hours
        .unwrap_or(if observed_window_hours > 0.0 {
            observed_window_hours
        } else {
            valid_coverage * 10.5
        })
        .clamp(2.0, 14.0);

    let source_blend = compute_source_blend(&night);

    NightFeatureSet {
        night_date: reference_date,
        resting_heart_rate,
        rmssd,
        sdnn,
        pnn50,
        respiratory_rate,
        continuity,
        regularity,
        valid_coverage,
        confidence_raw,
        sleep_estimate_hours,
        source_blend,
    }
}

pub fn effective_sleep_feature_set(
    feature: &NightFeatureSet,
    sleep_summary: Option<&SleepDetectionSummary>,
) -> NightFeatureSet {
    let Some(summary) = sleep_summary else {
        return feature.clone();
    };
    if feature.valid_coverage < 0.35 {
        return feature.clone();
    }
    let continuity_diff = (feature.continuity - summary.continuity).abs();
    let regularity_diff = (feature.regularity - summary.regularity).abs();
    let conf_adj = if continuity_diff < 0.15 && regularity_diff < 0.15 {
        0.1
    } else if continuity_diff > 0.4 || regularity_diff > 0.4 {
        -0.15
    } else {
        0.0
    };
    let merged_continuity = (feature.continuity + summary.continuity) / 2.0;
    let merged_regularity = (feature.regularity + summary.regularity) / 2.0;
    let merged_coverage = feature.valid_coverage.max(summary.valid_coverage);
    let merged_confidence = (feature.confidence_raw + conf_adj).clamp(0.0, 1.0);
    let merged_sleep = if summary.duration_hours > 0.0 {
        summary.duration_hours
    } else {
        feature.sleep_estimate_hours
    };
    NightFeatureSet {
        continuity: merged_continuity,
        regularity: merged_regularity,
        valid_coverage: merged_coverage,
        confidence_raw: merged_confidence,
        sleep_estimate_hours: merged_sleep,
        ..feature.clone()
    }
}

pub fn recompute_baseline_profile(features: &[NightFeatureSet]) -> BaselineProfile {
    let valid: Vec<&NightFeatureSet> = features
        .iter()
        .filter(|f| {
            f.valid_coverage >= 0.35
                && f.resting_heart_rate > 0.0
                && f.rmssd >= 0.0
                && f.sdnn >= 0.0
        })
        .collect();

    if valid.is_empty() {
        return BaselineProfile {
            resting_heart_rate: 0.0,
            rmssd: 0.0,
            sdnn: 0.0,
            nights_used: 0,
            is_warmed_up: false,
            max_heart_rate: None,
        };
    }

    let max_resting = valid
        .iter()
        .map(|f| f.resting_heart_rate)
        .fold(f64::NEG_INFINITY, f64::max);
    let max_heart_rate = if max_resting > 0.0 {
        Some((max_resting * 1.5).round())
    } else {
        None
    };
    let n = valid.len() as f64;
    let resting = valid.iter().map(|f| f.resting_heart_rate).sum::<f64>() / n;
    let rmssd = valid.iter().map(|f| f.rmssd).sum::<f64>() / n;
    let sdnn = valid.iter().map(|f| f.sdnn).sum::<f64>() / n;

    BaselineProfile {
        resting_heart_rate: resting,
        rmssd,
        sdnn,
        nights_used: valid.len() as i32,
        is_warmed_up: valid.len() >= 5,
        max_heart_rate,
    }
}

const RECOVERY_HRV_WEIGHT: f64 = 0.7;
const RECOVERY_RHR_WEIGHT: f64 = 0.2;
const RECOVERY_SLEEP_WEIGHT: f64 = 0.1;
const RECOVERY_HISTORY_WINDOW_DAYS: i64 = 60;
const RECOVERY_MIN_HISTORY: usize = 7;

fn mean_std(values: &[f64]) -> (f64, f64) {
    if values.is_empty() {
        return (0.0, 0.0);
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let var = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64;
    (mean, var.sqrt())
}

fn compute_recovery_zscore(
    feature: &NightFeatureSet,
    history: &[NightFeatureSet],
    target_sleep_minutes: f64,
) -> Option<i32> {
    let tonight = feature.night_date.timestamp_millis();
    let cutoff = tonight - RECOVERY_HISTORY_WINDOW_DAYS * 86_400_000;
    let mut valid: Vec<&NightFeatureSet> = history
        .iter()
        .filter(|f| {
            f.night_date.timestamp_millis() < tonight
                && f.night_date.timestamp_millis() >= cutoff
                && f.valid_coverage >= 0.35
                && f.resting_heart_rate > 0.0
                && f.rmssd > 0.0
        })
        .collect();
    if valid.len() < RECOVERY_MIN_HISTORY {
        return None;
    }
    valid.sort_by(|a, b| b.night_date.cmp(&a.night_date));

    let hrv: Vec<f64> = valid.iter().map(|f| f.rmssd).collect();
    let rhr: Vec<f64> = valid.iter().map(|f| f.resting_heart_rate).collect();
    let sleep: Vec<f64> = valid.iter().map(|f| f.sleep_estimate_hours).collect();
    let hrv_stats = mean_std(&hrv);
    let rhr_stats = mean_std(&rhr);
    let sleep_stats = mean_std(&sleep);

    let safe_std = |s: f64| if s > 0.5 { s } else { 0.5 };
    let hrv_z = ((feature.rmssd - hrv_stats.0) / safe_std(hrv_stats.1)).clamp(-3.0, 3.0);
    let rhr_z =
        (-(feature.resting_heart_rate - rhr_stats.0) / safe_std(rhr_stats.1)).clamp(-3.0, 3.0);
    let sleep_z =
        ((feature.sleep_estimate_hours - sleep_stats.0) / safe_std(sleep_stats.1)).clamp(-3.0, 3.0);

    let target_hours = target_sleep_minutes / 60.0;
    let target_miss = (feature.sleep_estimate_hours / target_hours).clamp(0.0, 1.0);
    let sleep_term = sleep_z * target_miss;

    let combined = RECOVERY_HRV_WEIGHT * hrv_z
        + RECOVERY_RHR_WEIGHT * rhr_z
        + RECOVERY_SLEEP_WEIGHT * sleep_term;
    Some(((65.0 + combined * 15.0).round() as i32).clamp(0, 100))
}

pub fn compute_daily_score(
    feature: &NightFeatureSet,
    baseline: BaselineProfile,
    target_sleep_minutes: f64,
    history: &[NightFeatureSet],
) -> DailyWellnessScore {
    let z_recovery = compute_recovery_zscore(feature, history, target_sleep_minutes);
    let continuity_boost = (feature.continuity - 0.5) * 35.0;
    let regularity_boost = (feature.regularity - 0.5) * 20.0;
    let fallback_recovery =
        ((65.0 + continuity_boost + regularity_boost).round() as i32).clamp(0, 100);
    let daily_balance = z_recovery.unwrap_or(fallback_recovery);

    let rhr_penalty = if baseline.is_warmed_up {
        (feature.resting_heart_rate - baseline.resting_heart_rate).max(0.0) * 1.5
    } else {
        0.0
    };
    let load_pressure =
        ((35.0 + (70.0 - daily_balance as f64).max(0.0) + rhr_penalty * 0.8).round() as i32)
            .clamp(0, 100);
    let sleep_reserve = feature.sleep_estimate_hours - target_sleep_minutes / 60.0;
    let recommendation = if daily_balance < 42 || sleep_reserve < -1.1 {
        Recommendation::Restore
    } else if daily_balance > 72 && load_pressure < 58 {
        Recommendation::Build
    } else {
        Recommendation::Steady
    };
    let confidence = if feature.confidence_raw >= 0.75 {
        Confidence::High
    } else if feature.confidence_raw >= 0.45 {
        Confidence::Medium
    } else {
        Confidence::Low
    };
    let detail = format!(
        "Balance {daily_balance}, Load {load_pressure}, Sleep reserve {:.1}h",
        sleep_reserve
    );
    DailyWellnessScore {
        day_date: feature.night_date,
        daily_balance,
        load_pressure,
        sleep_reserve_hours: sleep_reserve,
        confidence,
        recommendation,
        detail,
    }
}

fn estimate_expected_samples(
    night: &[&SignalSample],
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> f64 {
    let window_secs = ((window_end - window_start).num_milliseconds() as f64 / 1000.0).max(1.0);
    if night.len() < 2 {
        return (window_secs / 60.0).round().max(1.0);
    }
    let mut intervals = Vec::new();
    for i in 1..night.len() {
        let dt = (night[i].timestamp - night[i - 1].timestamp).num_milliseconds() as f64 / 1000.0;
        if dt > 0.0 && dt <= 300.0 {
            intervals.push(dt);
        }
    }
    intervals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let sample_interval = if intervals.is_empty() {
        60.0
    } else {
        intervals[intervals.len() / 2]
    };
    (window_secs / sample_interval).round().max(1.0)
}

fn estimate_continuity(samples: &[&SignalSample]) -> f64 {
    if samples.len() < 2 {
        return 0.5;
    }
    let mut sorted = samples.to_vec();
    sorted.sort_by_key(|s| s.timestamp);
    let mut gap_count = 0usize;
    for i in 1..sorted.len() {
        let gap_min =
            (sorted[i].timestamp - sorted[i - 1].timestamp).num_milliseconds() as f64 / 60000.0;
        if gap_min > 8.0 {
            gap_count += 1;
        }
    }
    let total = sorted.len() as f64;
    (1.0 - gap_count as f64 / (total / 8.0).max(1.0)).clamp(0.0, 1.0)
}

fn compute_source_blend(samples: &[&SignalSample]) -> String {
    if samples.is_empty() {
        return "none".to_string();
    }
    let mut strap = 0usize;
    let mut healthkit = 0usize;
    for s in samples {
        if s.source.to_lowercase().contains("strap") {
            strap += 1;
        } else {
            healthkit += 1;
        }
    }
    match (strap, healthkit) {
        (s, h) if s > 0 && h > 0 => format!("strap:{s},healthkit:{h}"),
        (s, _) if s > 0 => format!("strap:{s}"),
        (_, h) => format!("healthkit:{h}"),
    }
}

fn compute_rmssd(ibis: &[f64]) -> f64 {
    if ibis.len() < 2 {
        return 0.0;
    }
    let mut sum_sq = 0.0;
    for i in 1..ibis.len() {
        let d = ibis[i] - ibis[i - 1];
        sum_sq += d * d;
    }
    (sum_sq / (ibis.len() - 1) as f64).sqrt()
}

fn compute_pnn50(ibis: &[f64]) -> f64 {
    if ibis.len() < 2 {
        return 0.0;
    }
    let mut count = 0usize;
    for i in 1..ibis.len() {
        if (ibis[i] - ibis[i - 1]).abs() > 50.0 {
            count += 1;
        }
    }
    count as f64 / (ibis.len() - 1) as f64 * 100.0
}

fn percentile(vals: &[f64], p: f64) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    let mut s = vals.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (p * s.len() as f64).floor() as usize;
    s[idx.min(s.len() - 1)]
}

fn std_dev(vals: &[f64]) -> f64 {
    if vals.len() < 2 {
        return 0.0;
    }
    let mean = vals.iter().sum::<f64>() / vals.len() as f64;
    let var = vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / vals.len() as f64;
    var.sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample(ts: DateTime<Utc>, hr: f64) -> SignalSample {
        SignalSample {
            timestamp: ts,
            source: "strap".to_string(),
            heart_rate: hr,
            ibi_ms: Some(60_000.0 / hr),
            motion_score: Some(0.2),
            quality_score: 0.8,
        }
    }

    fn baseline_empty() -> BaselineProfile {
        BaselineProfile {
            resting_heart_rate: 0.0,
            rmssd: 0.0,
            sdnn: 0.0,
            nights_used: 0,
            is_warmed_up: false,
            max_heart_rate: None,
        }
    }

    #[test]
    fn sanitize_drops_out_of_range() {
        let t = Utc.with_ymd_and_hms(2026, 5, 25, 22, 0, 0).unwrap();
        let in_range = sample(t, 60.0);
        let too_low_hr = sample(t, 30.0);
        let too_high_hr = sample(t, 220.0);
        let mut bad_motion = sample(t, 60.0);
        bad_motion.motion_score = Some(0.9);
        let mut bad_quality = sample(t, 60.0);
        bad_quality.quality_score = 0.2;
        let cleaned =
            sanitize_signal_samples(&[in_range, too_low_hr, too_high_hr, bad_motion, bad_quality]);
        assert_eq!(cleaned.len(), 1);
        assert_eq!(cleaned[0].heart_rate, 60.0);
    }

    #[test]
    fn empty_history_yields_empty_baseline() {
        let b = recompute_baseline_profile(&[]);
        assert_eq!(b.nights_used, 0);
        assert!(!b.is_warmed_up);
    }

    #[test]
    fn build_feature_set_basic() {
        let bedtime = Utc.with_ymd_and_hms(2026, 5, 25, 22, 0, 0).unwrap();
        let wake = Utc.with_ymd_and_hms(2026, 5, 26, 6, 0, 0).unwrap();
        let samples: Vec<SignalSample> = (0..480)
            .map(|i| sample(bedtime + chrono::Duration::minutes(i), 55.0))
            .collect();
        let opts = NightFeatureBuildOptions {
            bedtime: Some(bedtime),
            wake_time: Some(wake),
            ..Default::default()
        };
        let feature = build_night_feature_set(&samples, wake, baseline_empty(), opts);
        assert!(feature.resting_heart_rate > 0.0);
        assert!((feature.sleep_estimate_hours - 8.0).abs() < 0.1);
        assert!((0.95..=1.0).contains(&feature.valid_coverage));
    }
}
