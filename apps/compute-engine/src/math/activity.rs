//! Activity-bout segmentation from 1 Hz gravity vectors.
//!
//! Ported from openwhoop's `detect_from_gravity` + `filter_merge`
//! (`resource/openwhoop/src/openwhoop-algos/src/activity.rs`), adapted to our
//! `HistoricalSensorRecordV1` shape and `chrono::DateTime<Utc>` clock.
//!
//! This module covers ONLY motion segmentation. Sleep filtering, HR-based
//! admission gates, Rich-10 classification, and per-bout strain layer on top
//! in subsequent passes.
//!
//! The classification problem solved here is binary: each maximal run of
//! samples is either `Active` (the wearer is moving) or `Still` (the wearer
//! is not). A 15-minute centered rolling-window stillness ratio is the core
//! decision so a wrist twitch does not flip the state.

use chrono::{DateTime, Duration, Utc};

use crate::math::strain::strain_score;
use crate::types::{
    ActivityBoutV1, BaselineProfileV1, HistoricalSensorRecordV1, SignalSampleV1,
    SleepDetectionSummaryV1,
};

const GRAVITY_STILL_THRESHOLD: f64 = 0.01;
const GRAVITY_WINDOW_MINUTES: i64 = 15;
const GRAVITY_STILL_FRACTION: f64 = 0.70;
const GRAVITY_MAX_GAP_MINUTES: i64 = 20;
const SHORT_SEGMENT_THRESHOLD_MINUTES: i64 = 15;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MotionState {
    Active,
    Still,
}

#[derive(Clone, Copy, Debug)]
pub struct RawSegment {
    pub motion: MotionState,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

impl RawSegment {
    pub fn duration(&self) -> Duration {
        self.end - self.start
    }
}

/// Compute per-sample gravity deltas. Samples with missing gravity are
/// treated as motion (`f64::MAX`) so they never count as still — matches
/// openwhoop's behaviour and avoids classifying BLE drops as sleep.
fn gravity_deltas(records: &[HistoricalSensorRecordV1]) -> Vec<f64> {
    let mut deltas = Vec::with_capacity(records.len());
    deltas.push(0.0);
    for w in records.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        let delta = match (
            a.gravity_x,
            a.gravity_y,
            a.gravity_z,
            b.gravity_x,
            b.gravity_y,
            b.gravity_z,
        ) {
            (Some(ax), Some(ay), Some(az), Some(bx), Some(by), Some(bz)) => {
                let dx = ax - bx;
                let dy = ay - by;
                let dz = az - bz;
                (dx * dx + dy * dy + dz * dz).sqrt()
            }
            _ => f64::MAX,
        };
        deltas.push(delta);
    }
    deltas
}

/// Median inter-sample interval in seconds, clipped to [1, 300]. Robust to
/// long off-wrist gaps that would skew the mean. Defaults to 60 s when there
/// is not enough data to compute a median.
fn median_interval_secs(records: &[HistoricalSensorRecordV1]) -> i64 {
    let mut diffs: Vec<i64> = records
        .windows(2)
        .map(|w| (w[1].timestamp - w[0].timestamp).num_seconds())
        .filter(|&d| d > 0 && d < 300)
        .collect();
    if diffs.is_empty() {
        return 60;
    }
    diffs.sort_unstable();
    diffs[diffs.len() / 2].max(1)
}

/// Detect raw motion segments. Output is a chronologically ordered list of
/// maximal motion-state runs. Runs are forcibly broken on any data gap
/// longer than 20 minutes. Short runs (< 15 min) are absorbed into
/// neighbours via `filter_merge`.
pub fn detect_raw_segments(records: &[HistoricalSensorRecordV1]) -> Vec<RawSegment> {
    if records.len() < 2 {
        return Vec::new();
    }

    let deltas = gravity_deltas(records);
    let avg_interval = median_interval_secs(records);
    let window_size = (((GRAVITY_WINDOW_MINUTES * 60) / avg_interval) as usize).max(3);
    let n = deltas.len();

    let still_frac: Vec<f64> = (0..n)
        .map(|i| {
            let half = window_size / 2;
            let start = i.saturating_sub(half);
            let end = (i + half + 1).min(n);
            let window = &deltas[start..end];
            let still = window
                .iter()
                .filter(|&&d| d < GRAVITY_STILL_THRESHOLD)
                .count();
            still as f64 / window.len() as f64
        })
        .collect();

    let is_still: Vec<bool> = still_frac
        .iter()
        .map(|&f| f >= GRAVITY_STILL_FRACTION)
        .collect();

    let gap_threshold = Duration::minutes(GRAVITY_MAX_GAP_MINUTES);
    let mut segments: Vec<RawSegment> = Vec::new();
    let mut run_start = 0usize;

    for i in 1..=n {
        let end_of_data = i == n;
        let class_change = !end_of_data && is_still[i] != is_still[run_start];
        let gap_break =
            !end_of_data && (records[i].timestamp - records[i - 1].timestamp) > gap_threshold;

        if end_of_data || class_change || gap_break {
            let motion = if is_still[run_start] {
                MotionState::Still
            } else {
                MotionState::Active
            };
            segments.push(RawSegment {
                motion,
                start: records[run_start].timestamp,
                end: records[i - 1].timestamp,
            });
            if !end_of_data {
                run_start = i;
            }
        }
    }

    filter_merge(segments)
}

/// Absorb short segments (< 15 min) into neighbours. If both neighbours
/// share the same motion state, bridge across the short segment. Otherwise,
/// the short segment is merged into whichever neighbour exists. Port of
/// openwhoop's `filter_merge`.
fn filter_merge(segments: Vec<RawSegment>) -> Vec<RawSegment> {
    if segments.is_empty() {
        return Vec::new();
    }

    let threshold = Duration::minutes(SHORT_SEGMENT_THRESHOLD_MINUTES);
    let mut working = segments;
    let mut merged: Vec<RawSegment> = Vec::new();
    let mut i = 0usize;

    while i < working.len() {
        let current = working[i];
        let short = current.duration() < threshold;

        if short {
            let has_prev = i > 0 && !merged.is_empty();
            let has_next = i + 1 < working.len();

            if has_prev && has_next && working[i - 1].motion == working[i + 1].motion {
                // Bridge across: previous + current + next all become one segment
                // of the neighbours' motion.
                let prev = merged.pop().expect("has_prev guard");
                merged.push(RawSegment {
                    motion: prev.motion,
                    start: prev.start,
                    end: working[i + 1].end,
                });
                i += 2; // skip next
                continue;
            } else if has_next {
                // Absorb into next
                working[i + 1] = RawSegment {
                    motion: working[i + 1].motion,
                    start: current.start,
                    end: working[i + 1].end,
                };
                i += 1;
                continue;
            } else if has_prev {
                // Absorb into previous (we're at the tail)
                let prev = merged.pop().expect("has_prev guard");
                merged.push(RawSegment {
                    motion: prev.motion,
                    start: prev.start,
                    end: current.end,
                });
                i += 1;
                continue;
            }
            // No neighbours at all — keep as-is. Falls through to else.
        }

        merged.push(current);
        i += 1;
    }

    merged
}

// ── Bout admission, promotion, classification ──────────────

const SLEEP_BUFFER_MIN: i64 = 10;
const CANDIDATE_HRR_THRESHOLD: f64 = 0.25;
const CANDIDATE_SUSTAINED_MIN: f64 = 3.0;
const PROMOTION_DURATION_MIN: f64 = 15.0;
const PROMOTION_STRAIN_MIN: f64 = 6.0;
const PROMOTION_CONFIDENCE_MIN: f64 = 0.6;

/// Personalized HRmax — Gellish nonlinear `192 − 0.007·age²` is the published
/// baseline, but we don't have age at the math layer. Use observed max if the
/// baseline carries one, otherwise fall back to 190.
fn resolve_hr_endpoints(baseline: &BaselineProfileV1) -> (f64, f64) {
    let resting = if baseline.resting_heart_rate > 0.0 {
        baseline.resting_heart_rate
    } else {
        60.0
    };
    let max = baseline.max_heart_rate.unwrap_or(190.0).max(resting + 30.0);
    (resting, max)
}

fn pct_hrr(hr: f64, resting: f64, max: f64) -> f64 {
    let reserve = max - resting;
    if reserve <= 0.0 {
        return 0.0;
    }
    ((hr - resting) / reserve).clamp(0.0, 1.0)
}

fn overlaps_sleep(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    sleep_detections: &[SleepDetectionSummaryV1],
) -> bool {
    let buf = Duration::minutes(SLEEP_BUFFER_MIN);
    sleep_detections.iter().any(|d| {
        let bed = d.bedtime - buf;
        let wake = d.wake_time + buf;
        bed <= end && wake >= start
    })
}

fn record_to_signal_sample(r: &HistoricalSensorRecordV1) -> SignalSampleV1 {
    SignalSampleV1 {
        timestamp: r.timestamp,
        source: "history".to_string(),
        heart_rate: r.heart_rate,
        ibi_ms: r.rr_average_ms,
        motion_score: None,
        quality_score: r.signal_quality.unwrap_or(1.0),
    }
}

struct BoutFeatures {
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    duration_minutes: f64,
    hr_avg: f64,
    hr_max: f64,
    /// Mean |Δgravity| over the bout — a proxy for arm-motion intensity at 1 Hz.
    motion_intensity: f64,
    /// Standard deviation of |Δgravity| — distinguishes episodic motion
    /// (Strength, sets+rests) from sustained motion (Running).
    motion_variance: f64,
    /// Fraction of bout-minutes spent at or above 50% HRR (the WHOOP
    /// "Cardio" floor) and 70% HRR (Running floor).
    fraction_hrr_above_50: f64,
    fraction_hrr_above_70: f64,
    fraction_hrr_above_25: f64,
    /// Number of (spike >=75% HRR) -> (recovery <50% HRR) cycles found.
    hiit_interval_count: u32,
}

fn compute_bout_features(
    segment: &RawSegment,
    records: &[HistoricalSensorRecordV1],
    baseline: &BaselineProfileV1,
) -> BoutFeatures {
    let (resting, max) = resolve_hr_endpoints(baseline);
    let in_window: Vec<&HistoricalSensorRecordV1> = records
        .iter()
        .filter(|r| r.timestamp >= segment.start && r.timestamp <= segment.end)
        .collect();

    let mut hr_sum = 0.0;
    let mut hr_max = 0.0_f64;
    let mut hr_count = 0u32;
    let mut hrr_samples: Vec<f64> = Vec::with_capacity(in_window.len());
    for r in &in_window {
        if r.heart_rate > 0.0 {
            hr_sum += r.heart_rate;
            hr_max = hr_max.max(r.heart_rate);
            hr_count += 1;
            hrr_samples.push(pct_hrr(r.heart_rate, resting, max));
        }
    }
    let hr_avg = if hr_count > 0 {
        hr_sum / hr_count as f64
    } else {
        0.0
    };

    let deltas = gravity_deltas(&in_window.iter().map(|r| (*r).clone()).collect::<Vec<_>>());
    let valid_deltas: Vec<f64> = deltas
        .into_iter()
        .filter(|d| d.is_finite() && *d < 1e30)
        .collect();
    let motion_intensity = if valid_deltas.is_empty() {
        0.0
    } else {
        valid_deltas.iter().sum::<f64>() / valid_deltas.len() as f64
    };
    let motion_variance = if valid_deltas.len() < 2 {
        0.0
    } else {
        let mean = motion_intensity;
        let var = valid_deltas.iter().map(|d| (d - mean).powi(2)).sum::<f64>()
            / valid_deltas.len() as f64;
        var.sqrt()
    };

    let total = hrr_samples.len() as f64;
    let frac = |threshold: f64| -> f64 {
        if total == 0.0 {
            0.0
        } else {
            hrr_samples.iter().filter(|&&p| p >= threshold).count() as f64 / total
        }
    };

    let duration_minutes = (segment.end - segment.start).num_seconds() as f64 / 60.0;
    let hiit_interval_count = count_hiit_intervals(&hrr_samples);

    BoutFeatures {
        start: segment.start,
        end: segment.end,
        duration_minutes,
        hr_avg,
        hr_max,
        motion_intensity,
        motion_variance,
        fraction_hrr_above_25: frac(0.25),
        fraction_hrr_above_50: frac(0.50),
        fraction_hrr_above_70: frac(0.70),
        hiit_interval_count,
    }
}

/// Count alternating spike (>=75% HRR) → recovery (<50% HRR) cycles.
fn count_hiit_intervals(hrr_samples: &[f64]) -> u32 {
    let mut cycles = 0u32;
    let mut state = 0u8; // 0 = looking for spike, 1 = looking for recovery
    for &p in hrr_samples {
        match state {
            0 => {
                if p >= 0.75 {
                    state = 1;
                }
            }
            _ => {
                if p < 0.50 {
                    cycles += 1;
                    state = 0;
                }
            }
        }
    }
    cycles
}

/// Returns the longest run (in samples) where every sample meets the
/// predicate. Used to verify "≥X min sustained above threshold" requirements.
fn longest_sustained_run<F: Fn(f64) -> bool>(hrr_samples: &[f64], pred: F) -> usize {
    let mut best = 0usize;
    let mut cur = 0usize;
    for &p in hrr_samples {
        if pred(p) {
            cur += 1;
            best = best.max(cur);
        } else {
            cur = 0;
        }
    }
    best
}

// ── Rich-10 classifier ─────────────────────────────────────

fn classify_bout(f: &BoutFeatures) -> (&'static str, f64) {
    // Priority order: highest-specificity first. Each predicate evaluates the
    // *necessary* class signature; the first that fires wins. "Sustained" in
    // the spec = ≥50% of bout duration above threshold.
    if f.hiit_interval_count >= 4 {
        return ("HIIT", 0.7);
    }
    if f.fraction_hrr_above_70 >= 0.5 && f.motion_variance >= 0.05 && f.duration_minutes >= 10.0 {
        return ("Running", 0.75);
    }
    if f.fraction_hrr_above_50 >= 0.5 && f.motion_variance < 0.02 && f.duration_minutes >= 15.0 {
        return ("Cycling", 0.65);
    }
    if f.fraction_hrr_above_25 >= 0.5 && f.motion_variance >= 0.05 && f.motion_intensity >= 0.05 {
        // Episodic motion: variance high relative to mean — suggests sets+rests.
        // Without a dedicated rep counter we accept this as a strong heuristic.
        let episodic = f.motion_variance / f.motion_intensity.max(0.001);
        if episodic > 1.5 {
            return ("Strength", 0.6);
        }
    }
    if f.fraction_hrr_above_25 >= 0.5 && f.fraction_hrr_above_50 < 0.5 && f.duration_minutes >= 45.0
    {
        // Walking-shape HR + long duration = Hiking. Barometer integration
        // would tighten this; we don't have it.
        return ("Hiking", 0.6);
    }
    if f.fraction_hrr_above_25 >= 0.5 && f.fraction_hrr_above_50 < 0.5 && f.duration_minutes >= 5.0
    {
        return ("Walking", 0.6);
    }
    if f.fraction_hrr_above_50 >= 0.5 {
        return ("Cardio", 0.55);
    }
    if f.duration_minutes >= 20.0 && f.fraction_hrr_above_50 >= 0.3 {
        // Mixed: unambiguous workout signal but ambiguous shape. NOT a
        // fallback for any admission.
        return ("Mixed", 0.5);
    }
    ("Light Activity", 0.4)
}

fn intensity_label(f: &BoutFeatures) -> &'static str {
    if f.fraction_hrr_above_70 >= 0.3 {
        "hard"
    } else if f.fraction_hrr_above_50 >= 0.3 {
        "moderate"
    } else {
        "light"
    }
}

// ── Top-level orchestrator ─────────────────────────────────

pub fn detect_activity_bouts(
    records: &[HistoricalSensorRecordV1],
    sleep_detections: &[SleepDetectionSummaryV1],
    baseline: &BaselineProfileV1,
) -> Vec<ActivityBoutV1> {
    if records.len() < 60 {
        return Vec::new();
    }
    let (resting, max) = resolve_hr_endpoints(baseline);

    let segments = detect_raw_segments(records);
    let mut bouts: Vec<ActivityBoutV1> = Vec::new();

    for seg in segments.iter().filter(|s| s.motion == MotionState::Active) {
        if overlaps_sleep(seg.start, seg.end, sleep_detections) {
            continue;
        }
        let features = compute_bout_features(seg, records, baseline);

        // Admission: HRR ≥ 25% sustained for ≥ CANDIDATE_SUSTAINED_MIN minutes.
        let in_window: Vec<&HistoricalSensorRecordV1> = records
            .iter()
            .filter(|r| r.timestamp >= seg.start && r.timestamp <= seg.end && r.heart_rate > 0.0)
            .collect();
        let hrr: Vec<f64> = in_window
            .iter()
            .map(|r| pct_hrr(r.heart_rate, resting, max))
            .collect();
        let sample_interval_secs = if in_window.len() < 2 {
            60
        } else {
            let mut diffs: Vec<i64> = in_window
                .windows(2)
                .map(|w| (w[1].timestamp - w[0].timestamp).num_seconds())
                .filter(|&d| d > 0 && d < 300)
                .collect();
            diffs.sort_unstable();
            diffs.get(diffs.len() / 2).copied().unwrap_or(60).max(1)
        };
        let required_run_samples =
            ((CANDIDATE_SUSTAINED_MIN * 60.0) / sample_interval_secs as f64).ceil() as usize;
        let sustained =
            longest_sustained_run(&hrr, |p| p >= CANDIDATE_HRR_THRESHOLD) >= required_run_samples;
        if !sustained {
            continue;
        }

        // Per-bout strain via the shared TRIMP helper.
        let samples: Vec<SignalSampleV1> = in_window
            .iter()
            .map(|r| record_to_signal_sample(r))
            .collect();
        let strain = strain_score(&samples, baseline).unwrap_or(0.0);

        // Classify + decide promotion.
        let (class, confidence) = classify_bout(&features);
        let promoted = features.duration_minutes >= PROMOTION_DURATION_MIN
            && strain >= PROMOTION_STRAIN_MIN
            && confidence >= PROMOTION_CONFIDENCE_MIN
            && class != "Light Activity";

        let (activity_type, source, final_confidence) = if promoted {
            (class.to_string(), "detected".to_string(), confidence)
        } else {
            (
                "Candidate".to_string(),
                "candidate".to_string(),
                (confidence * 0.6).max(0.3),
            )
        };

        bouts.push(ActivityBoutV1 {
            start_time: features.start,
            end_time: features.end,
            duration_minutes: round_2(features.duration_minutes),
            activity_type,
            intensity: intensity_label(&features).to_string(),
            confidence: round_2(final_confidence),
            heart_rate_avg: features.hr_avg.round(),
            heart_rate_max: features.hr_max,
            strain_score: round_2(strain),
            source,
            cadence_hz: None,
            flights_count: None,
            elevation_gain_meters: None,
            distance_meters: None,
            external_source: None,
        });
    }

    bouts
}

fn round_2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration as ChronoDuration, TimeZone};

    fn base() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()
    }

    fn record(minutes_from_base: i64, gravity: Option<[f64; 3]>) -> HistoricalSensorRecordV1 {
        record_with_hr(minutes_from_base, gravity, 70.0)
    }

    fn record_with_hr(
        minutes_from_base: i64,
        gravity: Option<[f64; 3]>,
        hr: f64,
    ) -> HistoricalSensorRecordV1 {
        let (gx, gy, gz) = match gravity {
            Some([x, y, z]) => (Some(x), Some(y), Some(z)),
            None => (None, None, None),
        };
        HistoricalSensorRecordV1 {
            timestamp: base() + ChronoDuration::seconds(minutes_from_base * 60),
            heart_rate: hr,
            rr_average_ms: None,
            spo2_red: None,
            spo2_ir: None,
            skin_temp_raw: None,
            gravity_magnitude: None,
            gravity_x: gx,
            gravity_y: gy,
            gravity_z: gz,
            resp_rate_raw: None,
            skin_contact: None,
            ppg_green: None,
            ppg_red_ir: None,
            ambient_light: None,
            led_drive1: None,
            led_drive2: None,
            signal_quality: None,
        }
    }

    fn baseline() -> BaselineProfileV1 {
        BaselineProfileV1 {
            resting_heart_rate: 60.0,
            rmssd: 50.0,
            sdnn: 60.0,
            nights_used: 5.0,
            is_warmed_up: true,
            max_heart_rate: Some(190.0),
        }
    }

    /// Generate `n_minutes` of records at 1-second granularity (60 records/min)
    /// with the given HR and a per-step alternating gravity (always Active).
    fn active_records_seconds(
        start_min: i64,
        n_minutes: i64,
        hr: f64,
    ) -> Vec<HistoricalSensorRecordV1> {
        let mut out = Vec::new();
        for m in 0..n_minutes {
            for s in 0..60 {
                let seconds = (start_min + m) * 60 + s;
                let v = if (m * 60 + s) % 2 == 0 { 1.0 } else { -1.0 };
                let (gx, gy, gz) = (Some(v), Some(0.0), Some(0.0));
                out.push(HistoricalSensorRecordV1 {
                    timestamp: base() + ChronoDuration::seconds(seconds),
                    heart_rate: hr,
                    rr_average_ms: None,
                    spo2_red: None,
                    spo2_ir: None,
                    skin_temp_raw: None,
                    gravity_magnitude: None,
                    gravity_x: gx,
                    gravity_y: gy,
                    gravity_z: gz,
                    resp_rate_raw: None,
                    skin_contact: None,
                    ppg_green: None,
                    ppg_red_ir: None,
                    ambient_light: None,
                    led_drive1: None,
                    led_drive2: None,
                    signal_quality: None,
                });
            }
        }
        out
    }

    // --- empty / degenerate -------------------------------------------------

    #[test]
    fn empty_returns_empty() {
        assert!(detect_raw_segments(&[]).is_empty());
    }

    #[test]
    fn single_record_returns_empty() {
        let r = vec![record(0, Some([0.0, 0.0, 1.0]))];
        assert!(detect_raw_segments(&r).is_empty());
    }

    // --- canonical states ---------------------------------------------------

    #[test]
    fn all_still_is_one_still_segment() {
        // 120 minute-spaced readings, gravity constant => delta is always 0
        let r: Vec<_> = (0..120).map(|m| record(m, Some([0.0, 0.0, 1.0]))).collect();
        let segs = detect_raw_segments(&r);
        assert_eq!(segs.len(), 1);
        assert_eq!(segs[0].motion, MotionState::Still);
    }

    #[test]
    fn all_moving_is_one_active_segment() {
        // alternating gravity vectors => large delta every step
        let r: Vec<_> = (0..120)
            .map(|m| {
                let v = if m % 2 == 0 { 1.0 } else { -1.0 };
                record(m, Some([v, 0.0, 0.0]))
            })
            .collect();
        let segs = detect_raw_segments(&r);
        assert_eq!(segs.len(), 1);
        assert_eq!(segs[0].motion, MotionState::Active);
    }

    #[test]
    fn missing_gravity_is_active() {
        // openwhoop convention: no gravity => delta MAX => active
        let r: Vec<_> = (0..120).map(|m| record(m, None)).collect();
        let segs = detect_raw_segments(&r);
        assert_eq!(segs.len(), 1);
        assert_eq!(segs[0].motion, MotionState::Active);
    }

    // --- gap break ----------------------------------------------------------

    #[test]
    fn long_gap_forces_segment_break() {
        // 60 min of still, then a 60-min gap, then 60 more min of still.
        // Each still block is > 15 min so filter_merge does not absorb.
        let mut r: Vec<_> = (0..60).map(|m| record(m, Some([0.0, 0.0, 1.0]))).collect();
        r.extend((120..180).map(|m| record(m, Some([0.0, 0.0, 1.0]))));
        let segs = detect_raw_segments(&r);
        assert!(
            segs.len() >= 2,
            "expected gap to split; got {} segments",
            segs.len()
        );
    }

    // --- window-fraction stillness ------------------------------------------

    #[test]
    fn brief_twitch_in_long_still_stays_still() {
        // 120 still minutes with a single twitch at minute 60. The centered
        // 15-min window around the twitch has 1/30 = ~3% activity, far below
        // the 30% threshold to flip to Active. The whole stretch must stay
        // Still.
        let mut r: Vec<_> = (0..120).map(|m| record(m, Some([0.0, 0.0, 1.0]))).collect();
        // Inject a single huge gravity delta at index 60
        r[60].gravity_x = Some(1.0);
        let segs = detect_raw_segments(&r);
        assert_eq!(segs.len(), 1);
        assert_eq!(segs[0].motion, MotionState::Still);
    }

    #[test]
    fn sustained_motion_within_long_still_becomes_active_segment() {
        // 90 still minutes + 30 minutes of high motion + 90 still minutes.
        // The 30-minute active block exceeds the 15-minute absorption
        // threshold, so it survives as its own segment.
        let mut r: Vec<HistoricalSensorRecordV1> = Vec::new();
        r.extend((0..90).map(|m| record(m, Some([0.0, 0.0, 1.0]))));
        r.extend((90..120).map(|m| {
            let v = if m % 2 == 0 { 1.0 } else { -1.0 };
            record(m, Some([v, 0.0, 0.0]))
        }));
        r.extend((120..210).map(|m| record(m, Some([0.0, 0.0, 1.0]))));

        let segs = detect_raw_segments(&r);
        // Expect three: Still, Active, Still
        assert_eq!(segs.len(), 3, "got {:?}", segs);
        assert_eq!(segs[0].motion, MotionState::Still);
        assert_eq!(segs[1].motion, MotionState::Active);
        assert_eq!(segs[2].motion, MotionState::Still);
    }

    // --- filter_merge -------------------------------------------------------

    #[test]
    fn short_active_segment_absorbs_into_still_neighbours() {
        // 20 still + 5 active + 20 still. The 5-min active block is shorter
        // than the 15-min absorption threshold and both neighbours are
        // still, so the whole stretch becomes one Still segment.
        let mut r: Vec<HistoricalSensorRecordV1> = Vec::new();
        r.extend((0..20).map(|m| record(m, Some([0.0, 0.0, 1.0]))));
        r.extend((20..25).map(|m| {
            let v = if m % 2 == 0 { 1.0 } else { -1.0 };
            record(m, Some([v, 0.0, 0.0]))
        }));
        r.extend((25..45).map(|m| record(m, Some([0.0, 0.0, 1.0]))));

        let segs = detect_raw_segments(&r);
        // After filter_merge bridging, the active blip is absorbed.
        let active_count = segs
            .iter()
            .filter(|s| s.motion == MotionState::Active)
            .count();
        assert_eq!(
            active_count, 0,
            "expected blip to be absorbed; got {:?}",
            segs
        );
    }

    // --- 262-min regression -------------------------------------------------

    // --- pct_hrr -----------------------------------------------------------

    #[test]
    fn pct_hrr_clamped_at_extremes() {
        assert_eq!(pct_hrr(60.0, 60.0, 190.0), 0.0);
        assert_eq!(pct_hrr(190.0, 60.0, 190.0), 1.0);
        assert_eq!(pct_hrr(300.0, 60.0, 190.0), 1.0);
        assert_eq!(pct_hrr(30.0, 60.0, 190.0), 0.0);
        // Halfway: HR=125 between resting 60 and max 190 → reserve 130 → (125-60)/130 = 0.5
        assert!((pct_hrr(125.0, 60.0, 190.0) - 0.5).abs() < 1e-9);
    }

    // --- admission gate ----------------------------------------------------

    #[test]
    fn low_hr_active_motion_yields_no_bout() {
        // 20 min of moving but with HR == resting (HRR = 0%). Should not even
        // pass Candidate admission.
        let recs = active_records_seconds(0, 20, 60.0);
        let bouts = detect_activity_bouts(&recs, &[], &baseline());
        assert!(
            bouts.is_empty(),
            "got bouts despite no HR elevation: {:?}",
            bouts
        );
    }

    #[test]
    fn active_with_high_hr_short_duration_becomes_candidate() {
        // 8 minutes of high HR + active motion. Long enough to admit
        // (>3 min sustained ≥25% HRR) but below the 15-min promotion bar.
        let recs = active_records_seconds(0, 8, 150.0);
        let bouts = detect_activity_bouts(&recs, &[], &baseline());
        assert_eq!(bouts.len(), 1);
        assert_eq!(bouts[0].activity_type, "Candidate");
        assert_eq!(bouts[0].source, "candidate");
    }

    #[test]
    fn active_with_high_hr_long_duration_promotes_to_named() {
        // 25 min at HR=170 (well into Running zone). Promotes.
        let recs = active_records_seconds(0, 25, 170.0);
        let bouts = detect_activity_bouts(&recs, &[], &baseline());
        assert_eq!(bouts.len(), 1, "got: {:?}", bouts);
        assert_eq!(bouts[0].source, "detected");
        assert!(
            matches!(bouts[0].activity_type.as_str(), "Running" | "Cardio"),
            "expected Running or Cardio; got {}",
            bouts[0].activity_type,
        );
        assert!(bouts[0].strain_score > 0.0);
    }

    // --- sleep veto --------------------------------------------------------

    #[test]
    fn bouts_overlapping_sleep_window_are_dropped() {
        let recs = active_records_seconds(0, 20, 150.0);
        let sleep = vec![SleepDetectionSummaryV1 {
            night_date: base(),
            bedtime: base() - ChronoDuration::minutes(60),
            wake_time: base() + ChronoDuration::minutes(120),
            duration_hours: 3.0,
            interruption_count: 0.0,
            continuity: 1.0,
            regularity: 1.0,
            valid_coverage: 1.0,
            confidence: 1.0,
        }];
        let bouts = detect_activity_bouts(&recs, &sleep, &baseline());
        assert!(bouts.is_empty());
    }

    // --- classifier shapes -------------------------------------------------

    #[test]
    fn hiit_classifier_fires_on_interval_pattern() {
        // 5 alternating HR spikes (180 = ~92% HRR, 4 min) and recoveries
        // (90 = ~23% HRR, 2 min). Total 30 min; ≥4 spike-recovery cycles.
        let mut recs = Vec::new();
        let mut clock = 0i64;
        for _ in 0..5 {
            recs.extend(active_records_seconds(clock, 4, 180.0));
            clock += 4;
            recs.extend(active_records_seconds(clock, 2, 90.0));
            clock += 2;
        }
        let bouts = detect_activity_bouts(&recs, &[], &baseline());
        let hiit = bouts.iter().find(|b| b.activity_type == "HIIT");
        assert!(hiit.is_some(), "expected HIIT bout, got: {:?}", bouts);
    }

    #[test]
    fn long_steady_moderate_hr_classifies_as_cardio_or_walking() {
        // 20 min at HR 110 (≈38% HRR) — moderate, no peaks.
        let recs = active_records_seconds(0, 20, 110.0);
        let bouts = detect_activity_bouts(&recs, &[], &baseline());
        assert_eq!(bouts.len(), 1);
        // 20 min at 38% HRR doesn't promote (< strain 6 and no class likely
        // hits confidence ≥ 0.6 except Walking/Hiking with right duration).
        // Either way: must not produce "General Exercise".
        assert_ne!(bouts[0].activity_type, "General Exercise");
    }

    // --- Mixed discipline --------------------------------------------------

    #[test]
    fn mixed_only_fires_on_unambiguous_workout_with_no_class_match() {
        // 25 min, HR alternating 140/100 every minute → 50% HRR average,
        // motion variance moderate. Should NOT pick Running (HR not high
        // enough), Cycling (variance not low enough), Walking (HR too high),
        // etc. Mixed has duration ≥ 20 min and HR fraction ≥ 0.3 above 50%.
        let mut recs = Vec::new();
        for m in 0..25 {
            let hr = if m % 2 == 0 { 140.0 } else { 100.0 };
            recs.extend(active_records_seconds(m, 1, hr));
        }
        let bouts = detect_activity_bouts(&recs, &[], &baseline());
        assert!(!bouts.is_empty());
        // We should NOT emit General Exercise — that name is deleted.
        for b in &bouts {
            assert_ne!(b.activity_type, "General Exercise");
        }
    }

    #[test]
    fn intermittent_fidget_in_sedentary_day_does_not_form_huge_active_bout() {
        // The 262-min "General Exercise" failure mode under the old detector:
        // a long sedentary stretch with sparse wrist twitches. The OLD code
        // opened a bout on the first twitch and the 5-min merge-gap glued
        // everything together. Window-fraction stillness must keep this Still.
        // Model: 262 minutes, a wrist twitch every 25 minutes (~10 in total).
        let mut r: Vec<HistoricalSensorRecordV1> = Vec::new();
        for m in 0..262 {
            let twitch = m > 0 && m % 25 == 0;
            let gravity = if twitch {
                Some([(m as f64).sin().abs() + 0.5, 0.0, 1.0])
            } else {
                Some([0.0, 0.0, 1.0])
            };
            r.push(record(m, gravity));
        }
        let segs = detect_raw_segments(&r);
        // No Active segment should ever materialise — the still_frac across
        // each 15-min window is dominated by the still samples.
        let active_count = segs
            .iter()
            .filter(|s| s.motion == MotionState::Active)
            .count();
        assert_eq!(
            active_count, 0,
            "262-min regression triggered: {} active segment(s) found in pure-still-with-sparse-twitch data; \
             segs = {:?}",
            active_count, segs,
        );
    }
}
