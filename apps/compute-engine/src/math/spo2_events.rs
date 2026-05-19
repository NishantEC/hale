use crate::math::TimestampedValue;
use chrono::{DateTime, Utc};

const BASELINE_WINDOW_SECONDS: i64 = 120;
const DIP_THRESHOLD_PERCENT: f64 = 3.0;
const MIN_DIP_SECONDS: f64 = 10.0;
const MIN_POINTS: usize = 30;

#[derive(Debug, Clone)]
pub struct DesaturationEvent {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub min_spo2: f64,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone)]
pub struct DesaturationResult {
    pub events: Vec<DesaturationEvent>,
    pub odi_per_hour: f64,
    pub lowest_spo2: f64,
}

pub fn detect_desaturation_events(points: &[TimestampedValue]) -> Option<DesaturationResult> {
    if points.len() < MIN_POINTS {
        return None;
    }
    let mut sorted: Vec<TimestampedValue> = points.to_vec();
    sorted.sort_by_key(|p| p.timestamp);

    let first_ms = sorted[0].timestamp.timestamp_millis();
    let last_ms = sorted[sorted.len() - 1].timestamp.timestamp_millis();
    let total_hours = (last_ms - first_ms) as f64 / 3_600_000.0;
    if total_hours <= 0.0 {
        return Some(DesaturationResult {
            events: Vec::new(),
            odi_per_hour: 0.0,
            lowest_spo2: 100.0,
        });
    }

    let mut lowest_spo2 = 100.0_f64;
    let mut events: Vec<DesaturationEvent> = Vec::new();
    let mut in_dip = false;
    let mut dip_start: Option<DateTime<Utc>> = None;
    let mut dip_nadir = 100.0_f64;

    for i in 0..sorted.len() {
        let current = sorted[i];
        if current.value < lowest_spo2 {
            lowest_spo2 = current.value;
        }

        let current_ms = current.timestamp.timestamp_millis();
        let window_start_ms = current_ms - BASELINE_WINDOW_SECONDS * 1000;
        let window_points: Vec<&TimestampedValue> = sorted
            .iter()
            .filter(|p| {
                let pms = p.timestamp.timestamp_millis();
                pms >= window_start_ms && pms < current_ms
            })
            .collect();

        if window_points.len() < 3 {
            continue;
        }
        let baseline: f64 =
            window_points.iter().map(|p| p.value).sum::<f64>() / window_points.len() as f64;
        let drop = baseline - current.value;

        if drop >= DIP_THRESHOLD_PERCENT {
            if !in_dip {
                in_dip = true;
                dip_start = Some(current.timestamp);
                dip_nadir = current.value;
            } else if current.value < dip_nadir {
                dip_nadir = current.value;
            }
        } else if in_dip {
            if let Some(start) = dip_start {
                let duration_seconds = (current.timestamp.timestamp_millis()
                    - start.timestamp_millis()) as f64
                    / 1000.0;
                if duration_seconds >= MIN_DIP_SECONDS {
                    events.push(DesaturationEvent {
                        start,
                        end: current.timestamp,
                        min_spo2: dip_nadir,
                        duration_seconds,
                    });
                }
            }
            in_dip = false;
            dip_start = None;
            dip_nadir = 100.0;
        }
        let _ = i;
    }

    if in_dip {
        if let Some(start) = dip_start {
            let last_ts = sorted[sorted.len() - 1].timestamp;
            let duration_seconds =
                (last_ts.timestamp_millis() - start.timestamp_millis()) as f64 / 1000.0;
            if duration_seconds >= MIN_DIP_SECONDS {
                events.push(DesaturationEvent {
                    start,
                    end: last_ts,
                    min_spo2: dip_nadir,
                    duration_seconds,
                });
            }
        }
    }

    let odi_per_hour = events.len() as f64 / total_hours;
    Some(DesaturationResult {
        events,
        odi_per_hour,
        lowest_spo2,
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
    fn returns_none_under_min_points() {
        let points: Vec<TimestampedValue> = (0..20).map(|i| point(i, 98.0)).collect();
        assert!(detect_desaturation_events(&points).is_none());
    }

    #[test]
    fn flat_series_no_events() {
        // 60 points at constant 98 → no drops at all
        let points: Vec<TimestampedValue> = (0..60).map(|i| point(i * 5, 98.0)).collect();
        let r = detect_desaturation_events(&points).expect("expected Some");
        assert_eq!(r.events.len(), 0);
        assert_eq!(r.lowest_spo2, 98.0);
        assert_eq!(r.odi_per_hour, 0.0);
    }

    #[test]
    fn obvious_drop_creates_event() {
        // 60 points 5s apart (300s total). First 30 at 98, then drop to 93 (5% drop)
        // for 20 points (100s), then back to 98 for the remaining 10.
        let mut points: Vec<TimestampedValue> = Vec::new();
        for i in 0..30 {
            points.push(point(i * 5, 98.0));
        }
        for i in 30..50 {
            points.push(point(i * 5, 93.0));
        }
        for i in 50..60 {
            points.push(point(i * 5, 98.0));
        }
        let r = detect_desaturation_events(&points).expect("expected Some");
        assert_eq!(r.events.len(), 1, "expected exactly 1 dip event");
        let ev = &r.events[0];
        assert!(ev.duration_seconds >= MIN_DIP_SECONDS);
        assert!((ev.min_spo2 - 93.0).abs() < 1e-9);
        assert_eq!(r.lowest_spo2, 93.0);
        assert!(r.odi_per_hour > 0.0);
    }

    #[test]
    fn brief_dip_below_min_seconds_filtered_out() {
        // Drop to 93 lasts only 1 sample (5s) — below MIN_DIP_SECONDS=10 → discarded
        let mut points: Vec<TimestampedValue> = Vec::new();
        for i in 0..30 {
            points.push(point(i * 5, 98.0));
        }
        points.push(point(30 * 5, 93.0));
        for i in 31..60 {
            points.push(point(i * 5, 98.0));
        }
        let r = detect_desaturation_events(&points).expect("expected Some");
        assert_eq!(r.events.len(), 0);
        assert_eq!(r.lowest_spo2, 93.0);
    }

    #[test]
    fn unsorted_input_sorted_first() {
        let mut points: Vec<TimestampedValue> = (0..60).map(|i| point(i * 5, 98.0)).collect();
        points.reverse();
        let r = detect_desaturation_events(&points).expect("expected Some");
        assert_eq!(r.events.len(), 0);
    }
}
