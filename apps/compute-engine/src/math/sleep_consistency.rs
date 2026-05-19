use crate::math::util::{average, clamp, std_dev};
use crate::types::{NightFeatureSetV1, SleepDetectionSummaryV1};
use chrono::{DateTime, Duration, Timelike, Utc};

fn seconds_since_midnight(ts: DateTime<Utc>) -> i64 {
    let naive = ts.naive_utc();
    (naive.hour() as i64) * 3600 + (naive.minute() as i64) * 60 + (naive.second() as i64)
}

fn unwrap_sleep_times(times: &[i64]) -> Vec<i64> {
    times
        .iter()
        .map(|&t| if t > 64_800 { t - 86_400 } else { t })
        .collect()
}

fn cv(values: &[f64]) -> f64 {
    if values.len() <= 1 {
        return 0.0;
    }
    let mean = average(values);
    if mean == 0.0 {
        return 0.0;
    }
    (std_dev(values) / mean.abs()) * 100.0
}

pub fn sleep_consistency_score(
    records: &[SleepDetectionSummaryV1],
    reference_date: DateTime<Utc>,
) -> Option<f64> {
    let mut recent: Vec<SleepDetectionSummaryV1> = records
        .iter()
        .filter(|r| r.night_date <= reference_date)
        .cloned()
        .collect();
    recent.sort_by_key(|r| r.night_date);
    if recent.len() > 7 {
        let drop = recent.len() - 7;
        recent.drain(0..drop);
    }
    if recent.len() < 3 {
        return None;
    }

    let durations: Vec<f64> = recent.iter().map(|r| r.duration_hours).collect();
    let duration_score = (100.0 - cv(&durations)).max(0.0);

    let starts_raw: Vec<i64> = recent
        .iter()
        .map(|r| seconds_since_midnight(r.bedtime))
        .collect();
    let start_times: Vec<f64> = unwrap_sleep_times(&starts_raw)
        .into_iter()
        .map(|v| v as f64)
        .collect();
    let end_times: Vec<f64> = recent
        .iter()
        .map(|r| seconds_since_midnight(r.wake_time) as f64)
        .collect();
    let mids_raw: Vec<i64> = recent
        .iter()
        .map(|r| {
            let half_ms = (r.duration_hours * 60.0 * 60.0 * 1000.0) / 2.0;
            let mid_ts = r.bedtime + Duration::milliseconds(half_ms as i64);
            seconds_since_midnight(mid_ts)
        })
        .collect();
    let midpoints: Vec<f64> = unwrap_sleep_times(&mids_raw)
        .into_iter()
        .map(|v| v as f64)
        .collect();

    let timing_components = [
        (100.0 - cv(&start_times)).max(0.0),
        (100.0 - cv(&end_times)).max(0.0),
        (100.0 - cv(&midpoints)).max(0.0),
    ];
    let timing_score = average(&timing_components);

    Some(clamp(average(&[duration_score, timing_score]), 0.0, 100.0))
}

pub fn sleep_consistency_score_from_night_features(
    records: &[NightFeatureSetV1],
    reference_date: DateTime<Utc>,
) -> Option<f64> {
    let mut recent: Vec<NightFeatureSetV1> = records
        .iter()
        .filter(|r| r.night_date <= reference_date)
        .cloned()
        .collect();
    recent.sort_by_key(|r| r.night_date);
    if recent.len() > 7 {
        let drop = recent.len() - 7;
        recent.drain(0..drop);
    }
    if recent.len() < 3 {
        return None;
    }

    let durations: Vec<f64> = recent.iter().map(|r| r.sleep_estimate_hours).collect();
    let mean = average(&durations);
    if mean <= 0.0 {
        return None;
    }
    let std = std_dev(&durations);
    let cv_value = (std / mean) * 100.0;
    Some(clamp(100.0 - cv_value, 0.0, 100.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn detection(
        night_secs: i64,
        bedtime_secs: i64,
        wake_secs: i64,
        duration_hours: f64,
    ) -> SleepDetectionSummaryV1 {
        SleepDetectionSummaryV1 {
            night_date: ts(night_secs),
            bedtime: ts(bedtime_secs),
            wake_time: ts(wake_secs),
            duration_hours,
            interruption_count: 0.0,
            continuity: 1.0,
            regularity: 1.0,
            valid_coverage: 1.0,
            confidence: 1.0,
        }
    }

    fn night(night_secs: i64, sleep_hours: f64) -> NightFeatureSetV1 {
        NightFeatureSetV1 {
            night_date: ts(night_secs),
            resting_heart_rate: 60.0,
            rmssd: 50.0,
            sdnn: 50.0,
            pnn50: 10.0,
            respiratory_rate: 14.0,
            continuity: 1.0,
            regularity: 1.0,
            valid_coverage: 1.0,
            confidence_raw: 1.0,
            sleep_estimate_hours: sleep_hours,
            source_blend: "test".to_string(),
        }
    }

    #[test]
    fn returns_none_when_fewer_than_three_records() {
        let records = vec![
            detection(86_400, 86_400 - 1800, 86_400 + 8 * 3600, 8.5),
            detection(86_400 * 2, 86_400 * 2 - 1800, 86_400 * 2 + 8 * 3600, 8.5),
        ];
        let r = sleep_consistency_score(&records, ts(86_400 * 5));
        assert!(r.is_none());
    }

    #[test]
    fn unwrap_sleep_times_wraparound_handled() {
        // 23:30 UTC = 84_600 → > 64_800 → unwraps to 84_600 - 86_400 = -1800
        // 23:00 = 82_800 → -3600
        // 00:30 next day = 1800 → stays 1800
        let v = unwrap_sleep_times(&[84_600, 82_800, 1800]);
        assert_eq!(v, vec![-1800, -3600, 1800]);
    }

    #[test]
    fn perfectly_consistent_sleep_scores_100() {
        // 3 nights, identical bedtime 23:00 UTC (82_800s into prior day),
        // identical wake at 07:00 (25_200), 8h duration
        let day = 86_400;
        let records = vec![
            // night 1: bedtime = day0 23:00, wake = day1 07:00, nightDate = day1
            detection(day, day - 3600, day + 7 * 3600, 8.0),
            detection(day * 2, day * 2 - 3600, day * 2 + 7 * 3600, 8.0),
            detection(day * 3, day * 3 - 3600, day * 3 + 7 * 3600, 8.0),
        ];
        let r = sleep_consistency_score(&records, ts(day * 5)).expect("expected Some");
        assert!((r - 100.0).abs() < 1e-9, "got {}", r);
    }

    #[test]
    fn variable_sleep_durations_score_lower_than_perfect() {
        let day = 86_400;
        // Bedtimes same, durations vary widely
        let records = vec![
            detection(day, day - 3600, day + 6 * 3600, 7.0),
            detection(day * 2, day * 2 - 3600, day * 2 + 8 * 3600, 9.0),
            detection(day * 3, day * 3 - 3600, day * 3 + 5 * 3600, 6.0),
        ];
        let r = sleep_consistency_score(&records, ts(day * 5)).expect("expected Some");
        assert!(r >= 0.0 && r <= 100.0);
        assert!(r < 99.0, "expected lower-than-perfect score, got {}", r);
    }

    #[test]
    fn only_last_seven_nights_used() {
        let day = 86_400;
        // 10 nights, last 3 have identical consistency; first 7 are wildly different
        let mut records = Vec::new();
        for i in 0..7 {
            // first 7 have varying duration and bedtimes
            let n = day * (i + 1) as i64;
            records.push(detection(
                n,
                n - 7200 * (i as i64 + 1),
                n + 4 * 3600,
                3.0 + i as f64,
            ));
        }
        for i in 7..10 {
            let n = day * (i + 1) as i64;
            records.push(detection(n, n - 3600, n + 7 * 3600, 8.0));
        }
        // Reference date includes all 10 → slice keeps last 7 (indices 3..10)
        let r = sleep_consistency_score(&records, ts(day * 11)).expect("expected Some");
        assert!(r > 0.0 && r <= 100.0);
    }

    #[test]
    fn future_records_filtered_out() {
        let day = 86_400;
        let records = vec![
            detection(day, day - 3600, day + 7 * 3600, 8.0),
            detection(day * 2, day * 2 - 3600, day * 2 + 7 * 3600, 8.0),
            detection(day * 100, day * 100 - 3600, day * 100 + 7 * 3600, 8.0),
        ];
        // reference cuts off the future record → only 2 remain → None
        let r = sleep_consistency_score(&records, ts(day * 3));
        assert!(r.is_none());
    }

    #[test]
    fn fallback_returns_none_when_mean_zero() {
        let nights = vec![
            night(86_400, 0.0),
            night(86_400 * 2, 0.0),
            night(86_400 * 3, 0.0),
        ];
        let r = sleep_consistency_score_from_night_features(&nights, ts(86_400 * 5));
        assert!(r.is_none());
    }

    #[test]
    fn fallback_returns_none_under_three_records() {
        let nights = vec![night(86_400, 8.0), night(86_400 * 2, 8.0)];
        let r = sleep_consistency_score_from_night_features(&nights, ts(86_400 * 5));
        assert!(r.is_none());
    }

    #[test]
    fn fallback_perfectly_consistent_scores_100() {
        let nights = vec![
            night(86_400, 8.0),
            night(86_400 * 2, 8.0),
            night(86_400 * 3, 8.0),
        ];
        let r = sleep_consistency_score_from_night_features(&nights, ts(86_400 * 5))
            .expect("expected Some");
        assert!((r - 100.0).abs() < 1e-9, "got {}", r);
    }

    #[test]
    fn fallback_variable_durations_score_lower() {
        let nights = vec![
            night(86_400, 4.0),
            night(86_400 * 2, 9.0),
            night(86_400 * 3, 6.0),
        ];
        let r = sleep_consistency_score_from_night_features(&nights, ts(86_400 * 5))
            .expect("expected Some");
        assert!(r >= 0.0 && r <= 100.0);
        assert!(r < 90.0);
    }
}
