use crate::math::TimestampedValue;
use crate::math::sensor_sample::SensorSample;

pub fn skin_temperature_points(samples: &[SensorSample]) -> Vec<TimestampedValue> {
    let mut out: Vec<TimestampedValue> = samples
        .iter()
        .filter(|s| s.skin_temp_raw >= 100.0)
        .map(|s| TimestampedValue {
            timestamp: s.timestamp,
            value: s.skin_temp_raw * 0.04,
        })
        .collect();
    out.sort_by_key(|p| p.timestamp);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, TimeZone, Utc};

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn sensor(secs: i64, raw: f64) -> SensorSample {
        SensorSample {
            timestamp: ts(secs),
            spo2_red: 0.0,
            spo2_ir: 0.0,
            skin_temp_raw: raw,
        }
    }

    #[test]
    fn empty_input_returns_empty() {
        assert!(skin_temperature_points(&[]).is_empty());
    }

    #[test]
    fn filters_below_100() {
        let samples = vec![
            sensor(1, 50.0),
            sensor(2, 99.999),
            sensor(3, 100.0),
            sensor(4, 850.0),
        ];
        let out = skin_temperature_points(&samples);
        assert_eq!(out.len(), 2);
        // 100 * 0.04 = 4.0
        assert!((out[0].value - 4.0).abs() < 1e-12);
        // 850 * 0.04 = 34.0
        assert!((out[1].value - 34.0).abs() < 1e-12);
    }

    #[test]
    fn output_is_sorted_ascending() {
        let samples = vec![
            sensor(10, 800.0),
            sensor(5, 200.0),
            sensor(20, 1000.0),
            sensor(7, 500.0),
        ];
        let out = skin_temperature_points(&samples);
        assert_eq!(out.len(), 4);
        assert_eq!(out[0].timestamp, ts(5));
        assert_eq!(out[1].timestamp, ts(7));
        assert_eq!(out[2].timestamp, ts(10));
        assert_eq!(out[3].timestamp, ts(20));
    }

    #[test]
    fn all_below_100_returns_empty() {
        let samples = vec![sensor(1, 50.0), sensor(2, 99.0)];
        assert!(skin_temperature_points(&samples).is_empty());
    }

    #[test]
    fn boundary_value_100_is_included() {
        let samples = vec![sensor(1, 100.0)];
        let out = skin_temperature_points(&samples);
        assert_eq!(out.len(), 1);
        assert!((out[0].value - 4.0).abs() < 1e-12);
    }
}
