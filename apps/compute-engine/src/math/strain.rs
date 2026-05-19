use crate::math::util::clamp;
use crate::types::{BaselineProfileV1, SignalSampleV1};

const STRAIN_LN_7201: f64 = 8.882_643_961_783_384;

pub fn strain_score(samples: &[SignalSampleV1], baseline: &BaselineProfileV1) -> Option<f64> {
    if samples.len() < 2 {
        return None;
    }
    let max_hr = baseline.max_heart_rate.unwrap_or(190.0);
    let resting = if baseline.resting_heart_rate > 0.0 {
        baseline.resting_heart_rate
    } else {
        60.0
    };
    if max_hr <= resting {
        return None;
    }
    let hr_reserve = max_hr - resting;

    let intervals: Vec<f64> = samples
        .windows(2)
        .map(|w| ((w[1].timestamp - w[0].timestamp).num_milliseconds() as f64 / 1000.0).max(1.0))
        .collect();
    let median_interval_seconds = if intervals.is_empty() {
        60.0
    } else {
        let mut sorted = intervals.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        sorted[sorted.len() / 2]
    };
    let fallback_interval_minutes = clamp(median_interval_seconds / 60.0, 1.0 / 60.0, 5.0);

    let mut covered_minutes = 0.0f64;
    let mut trimp = 0.0f64;
    for (idx, s) in samples.iter().enumerate() {
        let dt_minutes = if idx < samples.len() - 1 {
            let raw = (samples[idx + 1].timestamp - samples[idx].timestamp).num_milliseconds()
                as f64
                / 1000.0
                / 60.0;
            clamp(raw, 1.0 / 60.0, 5.0)
        } else {
            fallback_interval_minutes
        };
        covered_minutes += dt_minutes;

        let pct = ((s.heart_rate - resting) / hr_reserve) * 100.0;
        let weight = if pct >= 90.0 {
            5.0
        } else if pct >= 80.0 {
            4.0
        } else if pct >= 70.0 {
            3.0
        } else if pct >= 60.0 {
            2.0
        } else if pct >= 50.0 {
            1.0
        } else {
            0.0
        };
        trimp += dt_minutes * weight;
    }
    if covered_minutes < 10.0 {
        return None;
    }
    if trimp <= 0.0 {
        return Some(0.0);
    }
    let raw = (21.0 * (trimp + 1.0).ln()) / STRAIN_LN_7201;
    Some((clamp(raw, 0.0, 21.0) * 100.0).round() / 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, TimeZone, Utc};

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn sample(secs: i64, hr: f64) -> SignalSampleV1 {
        SignalSampleV1 {
            timestamp: ts(secs),
            source: "test".to_string(),
            heart_rate: hr,
            ibi_ms: None,
            motion_score: None,
            quality_score: 1.0,
        }
    }

    fn baseline(resting: f64, max_hr: Option<f64>) -> BaselineProfileV1 {
        BaselineProfileV1 {
            resting_heart_rate: resting,
            rmssd: 0.0,
            sdnn: 0.0,
            nights_used: 0.0,
            is_warmed_up: false,
            max_heart_rate: max_hr,
        }
    }

    #[test]
    fn empty_returns_none() {
        let b = baseline(60.0, Some(190.0));
        assert_eq!(strain_score(&[], &b), None);
    }

    #[test]
    fn single_sample_returns_none() {
        let b = baseline(60.0, Some(190.0));
        let s = vec![sample(0, 80.0)];
        assert_eq!(strain_score(&s, &b), None);
    }

    #[test]
    fn max_hr_at_or_below_resting_returns_none() {
        // maxHR equals resting
        let b = baseline(60.0, Some(60.0));
        let s = vec![sample(0, 80.0), sample(60, 80.0)];
        assert_eq!(strain_score(&s, &b), None);
        // maxHR < resting
        let b = baseline(70.0, Some(60.0));
        assert_eq!(strain_score(&s, &b), None);
    }

    #[test]
    fn resting_defaults_to_60_when_zero() {
        // resting_heart_rate <= 0 → fallback 60
        let b = baseline(0.0, Some(190.0));
        // 1 hour of HR=60 → exactly resting → all weights 0
        let s: Vec<SignalSampleV1> = (0..=60).map(|i| sample(i * 60, 60.0)).collect();
        let v = strain_score(&s, &b);
        assert_eq!(v, Some(0.0));
    }

    #[test]
    fn max_hr_defaults_to_190_when_none() {
        let b = baseline(60.0, None);
        // 1 hour of HR=60 → pct=0 → strain 0
        let s: Vec<SignalSampleV1> = (0..=60).map(|i| sample(i * 60, 60.0)).collect();
        let v = strain_score(&s, &b);
        assert_eq!(v, Some(0.0));
    }

    #[test]
    fn one_hour_at_resting_returns_zero() {
        let b = baseline(60.0, Some(190.0));
        // 61 samples 60 seconds apart → ~60 minutes coverage with last sample's
        // dt_minutes = median fallback (1 minute) → 61 minutes total
        let s: Vec<SignalSampleV1> = (0..=60).map(|i| sample(i * 60, 60.0)).collect();
        let v = strain_score(&s, &b).expect("expected Some");
        assert_eq!(v, 0.0);
    }

    #[test]
    fn under_ten_minutes_coverage_returns_none() {
        let b = baseline(60.0, Some(190.0));
        // 5 samples, each 60s apart, last uses median fallback (1 min)
        // covered = 4 * 1 + 1 = 5 minutes < 10 → None
        let s: Vec<SignalSampleV1> = (0..5).map(|i| sample(i * 60, 100.0)).collect();
        assert_eq!(strain_score(&s, &b), None);
    }

    #[test]
    fn high_intensity_one_hour_gives_meaningful_strain() {
        // maxHR=190, resting=60, hrReserve=130
        // To hit >=90% reserve we need pct >= 90:
        //   ((hr - 60) / 130) * 100 >= 90 → hr >= 177
        // Use hr=180 for the whole hour. weight=5, dt_minutes=1 per sample,
        // 60 dt of 1.0 minute + 1 fallback = 61 minutes covered, trimp = 61*5 = 305
        // raw = 21 * ln(306) / STRAIN_LN_7201 ≈ 21 * 5.7236 / 8.8826 ≈ 13.53
        let b = baseline(60.0, Some(190.0));
        let s: Vec<SignalSampleV1> = (0..=60).map(|i| sample(i * 60, 180.0)).collect();
        let v = strain_score(&s, &b).expect("expected Some");
        // Should be in the meaningful strain range (well above 9, below 21)
        assert!(v > 9.0 && v < 21.0, "expected meaningful strain, got {}", v);
        // Rounded to 2 decimals
        let scaled = v * 100.0;
        assert!((scaled - scaled.round()).abs() < 1e-9);
    }

    #[test]
    fn output_clamped_at_21_max() {
        // Massive trimp from very long high-intensity → should clamp at 21
        let b = baseline(60.0, Some(190.0));
        // 5000 samples at 60s apart with hr=180 → 5000*5 + fallback = huge trimp
        let s: Vec<SignalSampleV1> = (0..5000).map(|i| sample(i * 60, 180.0)).collect();
        let v = strain_score(&s, &b).expect("expected Some");
        assert!(v <= 21.0);
        // Should be at the cap (or extremely close)
        assert!(v > 20.0);
    }

    #[test]
    fn rounding_to_two_decimals() {
        let b = baseline(60.0, Some(190.0));
        let s: Vec<SignalSampleV1> = (0..=60).map(|i| sample(i * 60, 150.0)).collect();
        let v = strain_score(&s, &b).expect("expected Some");
        let scaled = v * 100.0;
        assert!((scaled - scaled.round()).abs() < 1e-9, "got {}", v);
    }
}
