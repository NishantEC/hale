use crate::math::TimestampedValue;
use crate::types::SignalSampleV1;

const WINDOW_SIZE: usize = 300;
const STEP: usize = 30;

pub fn rolling_rmssd(samples: &[SignalSampleV1]) -> Vec<TimestampedValue> {
    let mut sorted: Vec<SignalSampleV1> = samples
        .iter()
        .filter(|s| matches!(s.ibi_ms, Some(v) if v > 0.0))
        .cloned()
        .collect();
    sorted.sort_by_key(|s| s.timestamp);

    let mut results: Vec<TimestampedValue> = Vec::new();
    if sorted.len() < WINDOW_SIZE {
        return results;
    }

    let mut start = 0usize;
    while start + WINDOW_SIZE <= sorted.len() {
        let window = &sorted[start..start + WINDOW_SIZE];
        let ibis: Vec<f64> = window.iter().map(|s| s.ibi_ms.unwrap()).collect();

        // Artifact filter: reject successive diffs > 20% of previous
        let mut clean_ibis: Vec<f64> = Vec::with_capacity(ibis.len());
        clean_ibis.push(ibis[0]);
        for i in 1..ibis.len() {
            if (ibis[i] - ibis[i - 1]).abs() / ibis[i - 1] <= 0.20 {
                clean_ibis.push(ibis[i]);
            }
        }

        if clean_ibis.len() < 30 {
            start += STEP;
            continue;
        }

        let mut sum_sq_diffs = 0.0f64;
        for i in 1..clean_ibis.len() {
            let diff = clean_ibis[i] - clean_ibis[i - 1];
            sum_sq_diffs += diff * diff;
        }
        let rmssd = (sum_sq_diffs / (clean_ibis.len() - 1) as f64).sqrt();

        let midpoint = window[window.len() / 2].timestamp;
        results.push(TimestampedValue {
            timestamp: midpoint,
            value: (rmssd * 10.0).round() / 10.0,
        });

        start += STEP;
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, TimeZone, Utc};

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn sample(secs: i64, ibi: Option<f64>) -> SignalSampleV1 {
        SignalSampleV1 {
            timestamp: ts(secs),
            source: "test".to_string(),
            heart_rate: 60.0,
            ibi_ms: ibi,
            motion_score: None,
            quality_score: 1.0,
        }
    }

    #[test]
    fn empty_input_returns_empty() {
        assert!(rolling_rmssd(&[]).is_empty());
    }

    #[test]
    fn under_window_returns_empty() {
        let samples: Vec<SignalSampleV1> = (0..100).map(|i| sample(i, Some(1000.0))).collect();
        assert!(rolling_rmssd(&samples).is_empty());
    }

    #[test]
    fn filters_null_and_nonpositive_ibi() {
        // 100 nulls, 100 ibi=0, 200 valid → sorted has 200 valid, < 300 window → empty
        let mut samples: Vec<SignalSampleV1> = Vec::new();
        for i in 0..100 {
            samples.push(sample(i, None));
        }
        for i in 100..200 {
            samples.push(sample(i, Some(0.0)));
        }
        for i in 200..400 {
            samples.push(sample(i, Some(1000.0)));
        }
        let out = rolling_rmssd(&samples);
        assert!(out.is_empty());
    }

    #[test]
    fn constant_ibi_gives_two_windows_zero_rmssd() {
        // 350 samples, HR=60, ibi=1000ms → constant → rmssd=0
        // Windows: start=0 (0..300), start=30 (30..330) ⇒ 2 windows
        // (start=60: 60..360 > 350 → no)
        let samples: Vec<SignalSampleV1> = (0..350).map(|i| sample(i, Some(1000.0))).collect();
        let out = rolling_rmssd(&samples);
        assert_eq!(out.len(), 2);
        for p in &out {
            assert_eq!(p.value, 0.0);
        }
        // Midpoint of window[0..300] = index 150 → ts(150)
        assert_eq!(out[0].timestamp, ts(150));
        // Midpoint of window[30..330] = ts(30+150) = ts(180)
        assert_eq!(out[1].timestamp, ts(180));
    }

    #[test]
    fn artifact_filter_drops_outliers() {
        // 300 samples alternating 1000 and 1500 — successive diff is 500/1000=50%
        // → every odd-index gets filtered out → only index 0 remains
        // → clean.len() = 1 < 30 → skip → empty output
        let samples: Vec<SignalSampleV1> = (0..300)
            .map(|i| {
                let ibi = if i % 2 == 0 { 1000.0 } else { 1500.0 };
                sample(i, Some(ibi))
            })
            .collect();
        let out = rolling_rmssd(&samples);
        assert!(out.is_empty());
    }

    #[test]
    fn small_variation_passes_filter() {
        // 300 samples alternating 1000 and 1050 — diff is 50/1000=5% < 20% → all kept
        // diffs alternate ±50 → sum_sq = 299 * 50^2 / 299 = 2500 → rmssd = 50.0
        let samples: Vec<SignalSampleV1> = (0..300)
            .map(|i| {
                let ibi = if i % 2 == 0 { 1000.0 } else { 1050.0 };
                sample(i, Some(ibi))
            })
            .collect();
        let out = rolling_rmssd(&samples);
        assert_eq!(out.len(), 1);
        // (rmssd * 10).round() / 10 → 50.0
        assert!((out[0].value - 50.0).abs() < 1e-9);
    }

    #[test]
    fn unsorted_input_sorted_before_windowing() {
        let mut samples: Vec<SignalSampleV1> =
            (0..350).map(|i| sample(i, Some(1000.0))).collect();
        samples.reverse();
        let out = rolling_rmssd(&samples);
        assert_eq!(out.len(), 2);
        // Midpoints should still be ts(150) and ts(180)
        assert_eq!(out[0].timestamp, ts(150));
        assert_eq!(out[1].timestamp, ts(180));
    }

    #[test]
    fn output_rounded_to_one_decimal() {
        // Produce an rmssd value that isn't already at .0 precision.
        // 300 samples — 299 of value 1000, last 100 of slight variation.
        // We'll make the first 280 constant and the last 20 alternate small amounts.
        let mut samples: Vec<SignalSampleV1> = Vec::new();
        for i in 0..280 {
            samples.push(sample(i, Some(1000.0)));
        }
        for i in 280..300 {
            let ibi = if i % 2 == 0 { 1000.0 } else { 1003.0 };
            samples.push(sample(i, Some(ibi)));
        }
        let out = rolling_rmssd(&samples);
        assert_eq!(out.len(), 1);
        // Value should have at most 1 decimal of precision after rounding
        let scaled = out[0].value * 10.0;
        assert!((scaled - scaled.round()).abs() < 1e-9);
    }
}
