//! Sleep stage classifier — port of
//! apps/backend/src/processing/sleep-stage-classifier.ts.
//!
//! Quantile-prior algorithm:
//!   1. Densify sparse epoch features onto a 30-second wall-clock grid.
//!   2. Compute HR/motion/RR-std percentiles to normalise per-night.
//!   3. Score each epoch for wake/deep/rem using carry-forward feature
//!      series + per-night scales.
//!   4. Apply hard quantile priors — top 8% wake, top 20% deep, top 22%
//!      rem of the remaining "core" pool.
//!   5. Median-smooth window=6, then suppress runs shorter than 4 epochs.
//!
//! Output minutes are rounded counts × 30s.

use chrono::{DateTime, Duration, Utc};

use crate::math::epoch_features::EpochFeature;

const EPOCH_MS: i64 = 30 * 1000;
pub const EPOCH_MINUTES: f64 = 0.5;
const SMOOTH_WINDOW: usize = 6;
const MIN_RUN_LENGTH: usize = 4;
const TARGET_AWAKE: f64 = 0.08;
const TARGET_REM: f64 = 0.22;
const TARGET_DEEP: f64 = 0.20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Stage {
    Awake,
    Rem,
    Core,
    Deep,
}

impl Stage {
    pub fn as_str(&self) -> &'static str {
        match self {
            Stage::Awake => "awake",
            Stage::Rem => "rem",
            Stage::Core => "core",
            Stage::Deep => "deep",
        }
    }
}

#[derive(Debug, Clone)]
pub struct SleepDetectionInput {
    pub night_date: DateTime<Utc>,
    pub bedtime: DateTime<Utc>,
    pub wake_time: DateTime<Utc>,
    pub confidence: f64,
}

#[derive(Debug, Clone)]
pub struct StageEpoch {
    pub timestamp: DateTime<Utc>,
    pub stage: Stage,
}

#[derive(Debug, Clone)]
pub struct SleepStageSummary {
    pub night_date: DateTime<Utc>,
    pub rem_minutes: i32,
    pub core_minutes: i32,
    pub deep_minutes: i32,
    pub awake_minutes: i32,
    pub unknown_minutes: i32,
    pub confidence: f64,
    pub source: &'static str,
    pub epoch_timeline: Vec<StageEpoch>,
    pub epoch_minutes: f64,
}

pub fn classify_sleep_stages(
    epochs: &[EpochFeature],
    detections: &[SleepDetectionInput],
) -> Vec<SleepStageSummary> {
    let mut summaries = Vec::new();
    for d in detections {
        let mut night: Vec<EpochFeature> = epochs
            .iter()
            .filter(|e| e.timestamp >= d.bedtime && e.timestamp <= d.wake_time)
            .cloned()
            .collect();
        night.sort_by_key(|e| e.timestamp);
        if night.is_empty() {
            continue;
        }

        let dense = densify(&night, d.bedtime, d.wake_time);
        let stages = classify_night(&dense);
        let densified: Vec<StageEpoch> = dense
            .iter()
            .zip(stages.iter())
            .map(|(e, s)| StageEpoch {
                timestamp: e.timestamp,
                stage: *s,
            })
            .collect();

        let rem_minutes = count_stage(&densified, Stage::Rem);
        let core_minutes = count_stage(&densified, Stage::Core);
        let deep_minutes = count_stage(&densified, Stage::Deep);
        let awake_minutes = count_stage(&densified, Stage::Awake);

        let valid_count = night.iter().filter(|e| e.signal_completeness > 0.5).count();
        let feature_completeness = valid_count as f64 / dense.len().max(1) as f64;

        let transitions = densified
            .iter()
            .enumerate()
            .skip(1)
            .filter(|(i, c)| c.stage != densified[i - 1].stage)
            .count();
        let transition_score =
            (1.0 - transitions as f64 / (densified.len() / 3).max(1) as f64).max(0.0);

        let confidence =
            (feature_completeness * 0.45 + transition_score * 0.25 + d.confidence * 0.30)
                .clamp(0.0, 1.0);

        summaries.push(SleepStageSummary {
            night_date: d.night_date,
            rem_minutes,
            core_minutes,
            deep_minutes,
            awake_minutes,
            unknown_minutes: 0,
            confidence,
            source: "quantile-v1",
            epoch_timeline: densified,
            epoch_minutes: EPOCH_MINUTES,
        });
    }
    summaries.sort_by_key(|s| s.night_date);
    summaries
}

fn classify_night(epochs: &[EpochFeature]) -> Vec<Stage> {
    let n = epochs.len();
    if n == 0 {
        return Vec::new();
    }

    let hr_raw: Vec<Option<f64>> = epochs
        .iter()
        .map(|e| {
            if e.hr_mean.is_finite() {
                Some(e.hr_mean)
            } else {
                None
            }
        })
        .collect();
    let motion_raw: Vec<Option<f64>> = epochs
        .iter()
        .map(|e| {
            if e.motion_magnitude.is_finite() {
                Some(e.motion_magnitude)
            } else {
                None
            }
        })
        .collect();
    let rrstd_raw: Vec<Option<f64>> = epochs
        .iter()
        .map(|e| {
            if e.sdnn.is_finite() {
                Some(e.sdnn)
            } else {
                None
            }
        })
        .collect();

    let hr_vals: Vec<f64> = hr_raw.iter().filter_map(|v| *v).collect();
    let hr_p10 = percentile(&hr_vals, 10);
    let hr_p50 = percentile(&hr_vals, 50);
    let hr_p90 = percentile(&hr_vals, 90);
    let hr_span = (hr_p90 - hr_p10).max(1.0);

    let motion_vals: Vec<f64> = motion_raw.iter().filter_map(|v| *v).collect();
    let motion_p75 = percentile(&motion_vals, 75);

    let rrstd_vals: Vec<f64> = rrstd_raw
        .iter()
        .filter_map(|v| *v)
        .filter(|v| *v > 0.0)
        .collect();
    let rrstd_p75 = percentile(&rrstd_vals, 75);

    let hr_series = carry_forward(&hr_raw, hr_p50);
    let motion_series = carry_forward(&motion_raw, 0.0);
    let rrstd_series = carry_forward(&rrstd_raw, 0.0);

    let wake_score = |i: usize| -> f64 {
        if epochs[i].skin_contact == 0 {
            return f64::INFINITY;
        }
        let motion_norm = if motion_p75 > 0.0 {
            motion_series[i] / motion_p75
        } else {
            0.0
        };
        let hr_norm = (hr_series[i] - hr_p50) / hr_span;
        motion_norm * 2.0 + hr_norm.max(0.0) * 1.5
    };
    let deep_score = |i: usize| -> f64 {
        let motion_norm = if motion_p75 > 0.0 {
            motion_series[i] / motion_p75
        } else {
            0.0
        };
        let hr_low = (hr_p50 - hr_series[i]) / hr_span;
        let rrstd_norm = if rrstd_p75 > 0.0 {
            rrstd_series[i] / rrstd_p75
        } else {
            0.0
        };
        let stillness = (1.0 - motion_norm).max(0.0);
        hr_low * 1.5 + (1.0 - rrstd_norm) * 0.8 + stillness * 0.3
    };
    let rem_score = |i: usize| -> f64 {
        let motion_norm = if motion_p75 > 0.0 {
            motion_series[i] / motion_p75
        } else {
            0.0
        };
        let rrstd_norm = if rrstd_p75 > 0.0 {
            rrstd_series[i] / rrstd_p75
        } else {
            0.0
        };
        let stillness = (1.0 - motion_norm).max(0.0);
        rrstd_norm * 1.5 + stillness * 0.5
    };

    let mut stages: Vec<Stage> = vec![Stage::Core; n];

    let wake_k = ((n as f64 * TARGET_AWAKE).round() as usize).max(1);
    let wake_ranked = rank_indices(n, &wake_score);
    for &idx in wake_ranked.iter().take(wake_k.min(wake_ranked.len())) {
        stages[idx] = Stage::Awake;
    }
    for i in 0..n {
        if epochs[i].skin_contact == 0 {
            stages[i] = Stage::Awake;
        }
    }

    let deep_candidates: Vec<usize> = (0..n).filter(|i| stages[*i] != Stage::Awake).collect();
    let deep_ranked = rank_indices_from(&deep_candidates, &deep_score);
    let deep_k = (n as f64 * TARGET_DEEP).round() as usize;
    for &idx in deep_ranked.iter().take(deep_k.min(deep_ranked.len())) {
        stages[idx] = Stage::Deep;
    }

    let rem_candidates: Vec<usize> = (0..n).filter(|i| stages[*i] == Stage::Core).collect();
    let rem_ranked = rank_indices_from(&rem_candidates, &rem_score);
    let rem_k = (n as f64 * TARGET_REM).round() as usize;
    for &idx in rem_ranked.iter().take(rem_k.min(rem_ranked.len())) {
        stages[idx] = Stage::Rem;
    }

    suppress_rare_islands(&smooth_median(&stages, SMOOTH_WINDOW), MIN_RUN_LENGTH)
}

fn rank_indices(n: usize, score: &impl Fn(usize) -> f64) -> Vec<usize> {
    let mut arr: Vec<(usize, f64)> = (0..n).map(|i| (i, score(i))).collect();
    arr.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    arr.into_iter().map(|x| x.0).collect()
}

fn rank_indices_from(indices: &[usize], score: &impl Fn(usize) -> f64) -> Vec<usize> {
    let mut arr: Vec<(usize, f64)> = indices.iter().map(|i| (*i, score(*i))).collect();
    arr.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    arr.into_iter().map(|x| x.0).collect()
}

fn percentile(vals: &[f64], p: u8) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    let mut s = vals.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((p as f64 / 100.0) * s.len() as f64).floor() as usize;
    s[idx.min(s.len() - 1)]
}

fn carry_forward(values: &[Option<f64>], fallback: f64) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::with_capacity(values.len());
    let mut last: Option<f64> = None;
    for v in values {
        if v.is_some() {
            last = *v;
        }
        out.push(last.unwrap_or(fallback));
    }
    let first_real = values.iter().find_map(|v| *v);
    if let Some(first) = first_real {
        for i in 0..out.len() {
            if out[i] == fallback && values[i].is_none() {
                out[i] = first;
            } else {
                break;
            }
        }
    }
    out
}

fn smooth_median(input: &[Stage], window: usize) -> Vec<Stage> {
    let half = window / 2;
    (0..input.len())
        .map(|i| {
            let start = i.saturating_sub(half);
            let end = (i + half + 1).min(input.len());
            mode_stage(&input[start..end])
        })
        .collect()
}

fn mode_stage(arr: &[Stage]) -> Stage {
    use std::collections::HashMap;
    let mut counts: HashMap<Stage, usize> = HashMap::new();
    for s in arr {
        *counts.entry(*s).or_insert(0) += 1;
    }
    let mut best = arr[0];
    let mut best_c = 0;
    for (k, c) in counts {
        if c > best_c {
            best = k;
            best_c = c;
        }
    }
    best
}

fn suppress_rare_islands(input: &[Stage], min_run: usize) -> Vec<Stage> {
    let mut result = input.to_vec();
    let mut i = 0;
    while i < result.len() {
        let cur = result[i];
        let mut end = i + 1;
        while end < result.len() && result[end] == cur {
            end += 1;
        }
        if end - i < min_run && i > 0 && end < result.len() {
            let left = result[i - 1];
            for r in result.iter_mut().take(end).skip(i) {
                *r = left;
            }
        }
        i = end;
    }
    result
}

fn densify(
    source: &[EpochFeature],
    bedtime: DateTime<Utc>,
    wake_time: DateTime<Utc>,
) -> Vec<EpochFeature> {
    if source.is_empty() {
        return Vec::new();
    }
    let mut sorted = source.to_vec();
    sorted.sort_by_key(|e| e.timestamp);
    let total_ms = (wake_time - bedtime).num_milliseconds();
    let total_epochs = ((total_ms + EPOCH_MS - 1) / EPOCH_MS) as usize;
    let mut dense = Vec::with_capacity(total_epochs);
    let mut idx = 0usize;
    for i in 0..total_epochs {
        let t = bedtime + Duration::milliseconds(i as i64 * EPOCH_MS + EPOCH_MS / 2);
        while idx + 1 < sorted.len() && sorted[idx + 1].timestamp <= t {
            idx += 1;
        }
        let before = &sorted[idx];
        let after = &sorted[(idx + 1).min(sorted.len() - 1)];
        let before_dt = (t - before.timestamp).num_milliseconds().abs();
        let after_dt = (t - after.timestamp).num_milliseconds().abs();
        let nearest = if after_dt < before_dt { after } else { before };
        let mut copy = *nearest;
        copy.timestamp = t;
        dense.push(copy);
    }
    dense
}

fn count_stage(timeline: &[StageEpoch], stage: Stage) -> i32 {
    (timeline.iter().filter(|c| c.stage == stage).count() as f64 * EPOCH_MINUTES).round() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn epoch(t: DateTime<Utc>, hr: f64, motion: f64, sdnn: f64) -> EpochFeature {
        EpochFeature {
            timestamp: t,
            hr_mean: hr,
            hr_std: 0.0,
            hr_min: hr,
            hr_max: hr,
            hr_delta_from_baseline: 0.0,
            motion_magnitude: motion,
            motion_std: 0.0,
            motion_count: 0.0,
            still_fraction: 0.0,
            rmssd: 0.0,
            sdnn,
            rr_mean: 0.0,
            respiratory_rate: 14.0,
            respiratory_std: 0.0,
            spo2: 97.0,
            skin_temp: 33.0,
            skin_temp_delta: 0.0,
            clock_sin: 0.0,
            clock_cos: 0.0,
            skin_contact: 1,
            signal_completeness: 1.0,
            ambient_light_mean: 0.0,
            ppg_confidence: 1.0,
            device_signal_quality: 1.0,
            lf_power: f64::NAN,
            hf_power: f64::NAN,
            lf_hf_ratio: f64::NAN,
            rsa_amplitude: f64::NAN,
        }
    }

    #[test]
    fn empty_detections_returns_empty() {
        let out = classify_sleep_stages(&[], &[]);
        assert!(out.is_empty());
    }

    #[test]
    fn single_night_produces_summary_with_correct_totals() {
        use chrono::TimeZone;
        let bedtime = Utc.with_ymd_and_hms(2026, 5, 25, 22, 0, 0).unwrap();
        let wake = Utc.with_ymd_and_hms(2026, 5, 26, 6, 0, 0).unwrap();
        let mut epochs = Vec::new();
        for i in 0..(8 * 60 * 2) {
            let t = bedtime + Duration::seconds(i * 30);
            // Force a contiguous awake block by zeroing skin_contact 100 epochs
            // in (~3% of night) — the algorithm assigns awake for skin_contact==0
            // regardless of quantile and the median-smoother will keep the block.
            let mut e = epoch(t, 55.0 + (i as f64 % 7.0), 0.002, 30.0);
            if (200..230).contains(&i) {
                e.skin_contact = 0;
            }
            epochs.push(e);
        }
        let det = SleepDetectionInput {
            night_date: wake,
            bedtime,
            wake_time: wake,
            confidence: 0.9,
        };
        let out = classify_sleep_stages(&epochs, &[det]);
        assert_eq!(out.len(), 1);
        let s = &out[0];
        let total = s.rem_minutes + s.core_minutes + s.deep_minutes + s.awake_minutes;
        assert!((470..=490).contains(&total), "total={total}");
        assert!(s.awake_minutes > 0, "awake_minutes={}", s.awake_minutes);
    }
}
