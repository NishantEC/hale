use chrono::{DateTime, Utc};

use crate::types::SignalSampleV1;

#[derive(Debug, Clone, Copy)]
pub struct StressPoint {
    pub timestamp: DateTime<Utc>,
    pub value: f64,
}

const WINDOW_SIZE: usize = 120;
const STEP: usize = 30;

pub fn stress_points(samples: &[SignalSampleV1]) -> Vec<StressPoint> {
    if samples.len() < WINDOW_SIZE {
        return Vec::new();
    }

    let mut sorted: Vec<SignalSampleV1> = samples.to_vec();
    sorted.sort_by_key(|s| s.timestamp);

    let mut output = Vec::new();
    let mut start = 0usize;
    while start + WINDOW_SIZE <= sorted.len() {
        let window = &sorted[start..start + WINDOW_SIZE];
        let mut rr: Vec<f64> = Vec::with_capacity(window.len());
        for sample in window {
            if let Some(ibi) = sample.ibi_ms {
                rr.push(ibi);
            } else if sample.heart_rate > 0.0 {
                rr.push(60_000.0 / sample.heart_rate);
            }
        }
        if rr.len() >= WINDOW_SIZE {
            if let Some(score) = baevsky_stress_score(&rr) {
                let time = window[window.len() - 1].timestamp;
                output.push(StressPoint {
                    timestamp: time,
                    value: score,
                });
            }
        }
        start += STEP;
    }
    output
}

fn baevsky_stress_score(rr_ms: &[f64]) -> Option<f64> {
    if rr_ms.len() < 120 {
        return None;
    }
    let clamped: Vec<f64> = rr_ms
        .iter()
        .map(|v| v.max(250.0).min(2000.0))
        .collect();
    let min_rr = clamped.iter().copied().fold(f64::INFINITY, f64::min);
    let max_rr = clamped.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let vr = (max_rr - min_rr) / 1000.0;
    if vr < 0.0001 {
        return Some(10.0);
    }

    let bin_width = 50.0f64;
    // Preserve insertion order to match JS `Map` iteration semantics — when
    // two bins tie on count, JS picks the bin that was inserted first. Using a
    // HashMap here yields non-deterministic mode selection across runs.
    let mut order: Vec<i64> = Vec::new();
    let mut bins: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
    for value in &clamped {
        let bin = (value / bin_width).floor() as i64;
        let entry = bins.entry(bin).or_insert(0);
        if *entry == 0 {
            order.push(bin);
        }
        *entry += 1;
    }

    let mut mode_bin: i64 = 0;
    let mut mode_count: usize = 0;
    for bin in &order {
        let count = bins[bin];
        if count > mode_count {
            mode_bin = *bin;
            mode_count = count;
        }
    }

    let mode = mode_bin as f64 * bin_width + bin_width / 2.0;
    let mode_freq = mode_count as f64;
    let count = clamped.len() as f64;
    let a_mode = (mode_freq / count) * 100.0;
    let score = (a_mode / (2.0 * vr * (mode / 1000.0))).min(1000.0) / 100.0;
    Some((score * 100.0).round() / 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn sample(secs: i64, hr: f64, ibi: Option<f64>) -> SignalSampleV1 {
        SignalSampleV1 {
            timestamp: ts(secs),
            source: "test".to_string(),
            heart_rate: hr,
            ibi_ms: ibi,
            motion_score: None,
            quality_score: 1.0,
        }
    }

    #[test]
    fn empty_input_returns_empty() {
        assert!(stress_points(&[]).is_empty());
    }

    #[test]
    fn under_window_returns_empty() {
        let samples: Vec<SignalSampleV1> =
            (0..50).map(|i| sample(i, 60.0, Some(1000.0))).collect();
        assert!(stress_points(&samples).is_empty());
    }

    #[test]
    fn constant_60bpm_gives_degenerate_vr() {
        // 200 samples at exactly 60bpm → ibi=1000ms → all in same bin, vr=0
        let samples: Vec<SignalSampleV1> =
            (0..200).map(|i| sample(i, 60.0, Some(1000.0))).collect();
        let points = stress_points(&samples);
        assert!(!points.is_empty(), "expected at least one window");
        for p in &points {
            assert_eq!(p.value, 10.0, "degenerate VR should return 10.0");
        }
    }

    #[test]
    fn mixed_50_80_bpm_gives_real_score() {
        // Alternate samples between hr=50 (ibi=1200) and hr=80 (ibi=750)
        let samples: Vec<SignalSampleV1> = (0..200)
            .map(|i| {
                let hr = if i % 2 == 0 { 50.0 } else { 80.0 };
                let ibi = 60_000.0 / hr;
                sample(i, hr, Some(ibi))
            })
            .collect();
        let points = stress_points(&samples);
        assert!(!points.is_empty(), "expected at least one window");
        for p in &points {
            // Real score should be positive and not the degenerate constant
            assert!(p.value > 0.0, "score should be positive, got {}", p.value);
            // With this much variation, score should be well below 10.0
            assert!(p.value < 10.0, "score should be < 10.0, got {}", p.value);
            // Round-to-2 decimals check
            let scaled = p.value * 100.0;
            assert!((scaled - scaled.round()).abs() < 1e-9);
        }
    }

    #[test]
    fn falls_back_to_hr_when_ibi_missing() {
        // No ibiMs but heart_rate > 0 → derives rr from 60000/hr
        let samples: Vec<SignalSampleV1> = (0..200).map(|i| sample(i, 60.0, None)).collect();
        let points = stress_points(&samples);
        assert!(!points.is_empty());
        for p in &points {
            assert_eq!(p.value, 10.0);
        }
    }

    #[test]
    fn unsorted_input_is_sorted_by_timestamp() {
        // Reverse the timestamps; should still produce the same answer as sorted
        let mut samples: Vec<SignalSampleV1> =
            (0..200).map(|i| sample(i, 60.0, Some(1000.0))).collect();
        samples.reverse();
        let points = stress_points(&samples);
        assert!(!points.is_empty());
        // Ensure output timestamps are ascending
        for i in 1..points.len() {
            assert!(points[i].timestamp >= points[i - 1].timestamp);
        }
    }

    #[test]
    fn window_emits_last_timestamp() {
        let samples: Vec<SignalSampleV1> =
            (0..200).map(|i| sample(i, 60.0, Some(1000.0))).collect();
        let points = stress_points(&samples);
        // First window covers indices 0..120 → last timestamp = ts(119)
        assert_eq!(points[0].timestamp, ts(119));
        // Second window starts at step=30 → 30..150 → last = ts(149)
        assert_eq!(points[1].timestamp, ts(149));
    }

    #[test]
    fn baevsky_under_120_returns_none() {
        let rr: Vec<f64> = vec![1000.0; 119];
        assert_eq!(baevsky_stress_score(&rr), None);
    }
}
