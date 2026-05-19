use crate::math::TimestampedValue;
use chrono::{DateTime, Timelike, Utc};
use std::f64::consts::PI;

const SKIN_TO_CORE_OFFSET: f64 = 4.0;

#[derive(Debug, Clone)]
pub struct CoreTempResult {
    pub core_estimate: f64,
    pub nadir: DateTime<Utc>,
}

pub fn estimate_core_temperature(
    skin_temp_points: &[TimestampedValue],
    night_median_skin_temp: f64,
) -> Option<CoreTempResult> {
    if skin_temp_points.len() < 10 || night_median_skin_temp <= 0.0 {
        return None;
    }

    let mut min_temp = f64::INFINITY;
    let mut nadir_ts: Option<DateTime<Utc>> = None;
    let mut core_sum = 0.0_f64;

    for p in skin_temp_points.iter() {
        let naive = p.timestamp.naive_utc();
        let hour = naive.hour() as f64 + (naive.minute() as f64) / 60.0;
        let circadian_offset = -0.5 * ((2.0 * PI * (hour - 4.5)) / 24.0).cos();
        let core_estimate = p.value + SKIN_TO_CORE_OFFSET + circadian_offset;
        core_sum += core_estimate;

        if p.value < min_temp {
            min_temp = p.value;
            nadir_ts = Some(p.timestamp);
        }
    }

    let nadir = nadir_ts?;
    let avg_core = core_sum / skin_temp_points.len() as f64;
    Some(CoreTempResult {
        core_estimate: (avg_core * 10.0).round() / 10.0,
        nadir,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn point(secs: i64, value: f64) -> TimestampedValue {
        TimestampedValue {
            timestamp: ts(secs),
            value,
        }
    }

    #[test]
    fn returns_none_when_too_few_points() {
        let points: Vec<TimestampedValue> = (0..5).map(|i| point(i * 60, 33.0)).collect();
        assert!(estimate_core_temperature(&points, 33.0).is_none());
    }

    #[test]
    fn returns_none_when_median_zero_or_negative() {
        let points: Vec<TimestampedValue> = (0..20).map(|i| point(i * 60, 33.0)).collect();
        assert!(estimate_core_temperature(&points, 0.0).is_none());
        assert!(estimate_core_temperature(&points, -1.0).is_none());
    }

    #[test]
    fn nadir_is_lowest_point() {
        // 20 points across the night, value dips around index 10
        let points: Vec<TimestampedValue> = (0..20)
            .map(|i| {
                // Centered on i=10 with min value 32.0; otherwise 33.5
                let v = if i == 10 { 32.0 } else { 33.5 };
                // Spread across 10 hours starting from 1AM UTC = 3600
                point(3600 + i * 1800, v)
            })
            .collect();
        let r = estimate_core_temperature(&points, 33.0).expect("expected Some");
        // Nadir is the timestamp of the minimum skin temp
        assert_eq!(r.nadir, ts(3600 + 10 * 1800));
        // core_estimate ~= skin + 4 + small offset, value around 37.x
        assert!(r.core_estimate > 36.0 && r.core_estimate < 38.5, "got {}", r.core_estimate);
    }

    #[test]
    fn core_estimate_rounded_to_one_decimal() {
        let points: Vec<TimestampedValue> = (0..20)
            .map(|i| point(3600 + i * 1800, 33.456))
            .collect();
        let r = estimate_core_temperature(&points, 33.0).expect("expected Some");
        let scaled = r.core_estimate * 10.0;
        assert!((scaled - scaled.round()).abs() < 1e-9, "got {}", r.core_estimate);
    }
}
