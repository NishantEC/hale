use crate::math::sensor_sample::SensorSample;
use crate::math::util::{average, clamp, std_dev};
use crate::math::TimestampedValue;

const WINDOW_SIZE: usize = 30;
const STEP: usize = 15;

pub fn spo2_points(samples: &[SensorSample]) -> Vec<TimestampedValue> {
    if samples.len() < WINDOW_SIZE {
        return Vec::new();
    }
    let mut sorted: Vec<SensorSample> = samples.to_vec();
    sorted.sort_by_key(|s| s.timestamp);

    let mut output = Vec::new();
    let mut start = 0usize;
    while start + WINDOW_SIZE <= sorted.len() {
        let window = &sorted[start..start + WINDOW_SIZE];
        let reds: Vec<f64> = window.iter().map(|s| s.spo2_red).collect();
        let irs: Vec<f64> = window.iter().map(|s| s.spo2_ir).collect();
        let mean_red = average(&reds);
        let mean_ir = average(&irs);
        if mean_red < 1.0 || mean_ir < 1.0 {
            start += STEP;
            continue;
        }
        let ac_red = std_dev(&reds);
        let ac_ir = std_dev(&irs);
        if ac_red < 0.001 || ac_ir < 0.001 {
            start += STEP;
            continue;
        }
        let ratio = (ac_red / mean_red) / (ac_ir / mean_ir);
        let spo2 = clamp(110.0 - 25.0 * ratio, 70.0, 100.0);
        let time = window[window.len() - 1].timestamp;
        output.push(TimestampedValue {
            timestamp: time,
            value: spo2,
        });
        start += STEP;
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, TimeZone, Utc};

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn sensor(secs: i64, red: f64, ir: f64) -> SensorSample {
        SensorSample {
            timestamp: ts(secs),
            spo2_red: red,
            spo2_ir: ir,
            skin_temp_raw: 0.0,
        }
    }

    #[test]
    fn empty_input_returns_empty() {
        assert!(spo2_points(&[]).is_empty());
    }

    #[test]
    fn under_window_returns_empty() {
        let samples: Vec<SensorSample> = (0..20).map(|i| sensor(i, 1000.0, 1000.0)).collect();
        assert!(spo2_points(&samples).is_empty());
    }

    #[test]
    fn constant_signal_skipped_due_to_ac_floor() {
        // Constant values → std_dev = 0 < 0.001 → window skipped
        let samples: Vec<SensorSample> = (0..60).map(|i| sensor(i, 1000.0, 1000.0)).collect();
        let out = spo2_points(&samples);
        assert!(out.is_empty(), "expected ac threshold to skip all windows");
    }

    #[test]
    fn low_mean_skipped() {
        // mean_red < 1 → skip
        let samples: Vec<SensorSample> = (0..60)
            .map(|i| sensor(i, 0.5, 1000.0))
            .collect();
        let out = spo2_points(&samples);
        assert!(out.is_empty());
    }

    #[test]
    fn varying_signal_yields_clamped_spo2() {
        // Make AC small for IR, larger for red → ratio > 1 → spo2 < 110-25 = 85
        // Use varying signals: red oscillates more, IR oscillates less
        let samples: Vec<SensorSample> = (0..60)
            .map(|i| {
                let red = 1000.0 + ((i % 4) as f64) * 5.0;
                let ir = 1000.0 + ((i % 4) as f64) * 0.5;
                sensor(i, red, ir)
            })
            .collect();
        let out = spo2_points(&samples);
        assert!(!out.is_empty());
        for p in &out {
            assert!(p.value >= 70.0 && p.value <= 100.0, "spo2 must be clamped to [70,100]");
        }
    }

    #[test]
    fn window_uses_last_timestamp() {
        let samples: Vec<SensorSample> = (0..60)
            .map(|i| {
                let red = 1000.0 + ((i % 4) as f64) * 5.0;
                let ir = 1000.0 + ((i % 4) as f64) * 0.5;
                sensor(i, red, ir)
            })
            .collect();
        let out = spo2_points(&samples);
        // First window 0..30 → last ts(29). Second 15..45 → ts(44).
        assert_eq!(out[0].timestamp, ts(29));
        assert_eq!(out[1].timestamp, ts(44));
    }

    #[test]
    fn unsorted_input_sorted_first() {
        let mut samples: Vec<SensorSample> = (0..60)
            .map(|i| {
                let red = 1000.0 + ((i % 4) as f64) * 5.0;
                let ir = 1000.0 + ((i % 4) as f64) * 0.5;
                sensor(i, red, ir)
            })
            .collect();
        samples.reverse();
        let out = spo2_points(&samples);
        assert!(!out.is_empty());
        for i in 1..out.len() {
            assert!(out[i].timestamp >= out[i - 1].timestamp);
        }
    }
}
