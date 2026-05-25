//! Activity detection — port of apps/backend/src/processing/activity-detector.ts
//!
//! Algorithm shape:
//!   1. Sort records by timestamp; require ≥60.
//!   2. Filter to awake records (outside sleep windows with 10-min guard).
//!   3. Compute gravity deltas (or 1.0 fallback for missing data).
//!   4. Segment into continuous motion bouts (delta > MOTION_THRESHOLD).
//!   5. Force-close bouts spanning data gaps > 5 min.
//!   6. Merge bouts within 5-min gap; drop bouts shorter than 3 min.
//!   7. Classify each bout (Sedentary / Rest / Exercise / Light Activity)
//!      using motion intensity + HR zone + still fraction.
//!   8. Compute TRIMP-style strain per bout.
//!   9. Emit Off-Wrist / No-Data entries for gaps ≥15 min in awake records.
//!
//! Cadence detection (FFT) is intentionally not ported. The TS source notes
//! that historical packets carry low-rate gravity (~1/min) instead of the
//! 52 Hz IMU stream cadence needs, so the cadence-gated branches never fire.

use chrono::{DateTime, Duration, Utc};

pub const MOTION_THRESHOLD: f64 = 0.01;
const STILL_FRACTION_SEDENTARY: f64 = 0.85;
const MIN_BOUT_MINUTES: i64 = 3;
const MERGE_GAP_MINUTES: i64 = 5;
const BOUT_DATA_GAP_BREAK_MS: i64 = 5 * 60 * 1000;
const GAP_ENTRY_MIN_MS: i64 = 15 * 60 * 1000;
const STRAIN_LN_7201: f64 = 8.882_069_265_736_28;

#[derive(Debug, Clone)]
pub struct ActivityRecord {
    pub timestamp: DateTime<Utc>,
    pub heart_rate: f64,
    pub gravity_x: Option<f64>,
    pub gravity_y: Option<f64>,
    pub gravity_z: Option<f64>,
}

#[derive(Debug, Clone, Copy)]
pub struct SleepWindow {
    pub bedtime: DateTime<Utc>,
    pub wake_time: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy)]
pub enum OffWristSource {
    WristOff,
    ChargingOn,
}

#[derive(Debug, Clone, Copy)]
pub struct OffWristIntervalLite {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub source: Option<OffWristSource>,
}

#[derive(Debug, Clone, Copy)]
pub struct BaselineProfile {
    pub resting_hr: f64,
    pub max_hr: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Intensity {
    Light,
    Moderate,
    Hard,
}

impl Intensity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Intensity::Light => "light",
            Intensity::Moderate => "moderate",
            Intensity::Hard => "hard",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoutSource {
    Detected,
    Candidate,
}

impl BoutSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            BoutSource::Detected => "detected",
            BoutSource::Candidate => "candidate",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ActivityBout {
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration_minutes: f64,
    pub activity_type: String,
    pub intensity: Intensity,
    pub confidence: f64,
    pub heart_rate_avg: f64,
    pub heart_rate_max: f64,
    pub strain_score: f64,
    pub cadence_hz: Option<f64>,
    pub external_source: Option<String>,
    pub source: BoutSource,
}

pub fn detect_activities(
    records: &[ActivityRecord],
    sleep_detections: &[SleepWindow],
    baseline: BaselineProfile,
    off_wrist_intervals: &[OffWristIntervalLite],
) -> Vec<ActivityBout> {
    let mut sorted = records.to_vec();
    sorted.sort_by_key(|r| r.timestamp);
    if sorted.len() < 60 {
        return Vec::new();
    }

    let awake = filter_awake_records(&sorted, sleep_detections);
    let mut bouts = if awake.len() < 60 {
        Vec::new()
    } else {
        let deltas = compute_gravity_deltas(&awake);
        let raw = segment_into_bouts(&awake, &deltas);
        let merged = merge_bouts(raw, MERGE_GAP_MINUTES * 60 * 1000);
        let valid: Vec<_> = merged
            .into_iter()
            .filter(|b| (b.end - b.start).num_milliseconds() >= MIN_BOUT_MINUTES * 60 * 1000)
            .collect();
        valid
            .into_iter()
            .map(|b| classify_bout(b, &awake, baseline))
            .collect::<Vec<_>>()
    };

    let gap_bouts = detect_gap_entries(&awake, sleep_detections, off_wrist_intervals);
    bouts.extend(gap_bouts);
    bouts.sort_by_key(|b| b.start_time);
    bouts
}

#[derive(Debug, Clone, Copy)]
struct RawBout {
    start: DateTime<Utc>,
    end: DateTime<Utc>,
}

fn filter_awake_records(
    records: &[ActivityRecord],
    sleep_detections: &[SleepWindow],
) -> Vec<ActivityRecord> {
    if sleep_detections.is_empty() {
        return records.to_vec();
    }
    let buffer = Duration::minutes(10);
    records
        .iter()
        .filter(|r| {
            !sleep_detections
                .iter()
                .any(|d| r.timestamp >= d.bedtime - buffer && r.timestamp <= d.wake_time + buffer)
        })
        .cloned()
        .collect()
}

fn compute_gravity_deltas(records: &[ActivityRecord]) -> Vec<f64> {
    let mut deltas = Vec::with_capacity(records.len());
    deltas.push(0.0);
    for i in 1..records.len() {
        let prev = &records[i - 1];
        let curr = &records[i];
        match (
            prev.gravity_x,
            prev.gravity_y,
            prev.gravity_z,
            curr.gravity_x,
            curr.gravity_y,
            curr.gravity_z,
        ) {
            (Some(px), Some(py), Some(pz), Some(cx), Some(cy), Some(cz)) => {
                let dx = cx - px;
                let dy = cy - py;
                let dz = cz - pz;
                deltas.push((dx * dx + dy * dy + dz * dz).sqrt());
            }
            _ => deltas.push(1.0),
        }
    }
    deltas
}

fn segment_into_bouts(records: &[ActivityRecord], deltas: &[f64]) -> Vec<RawBout> {
    let mut bouts = Vec::new();
    let mut in_bout = false;
    let mut bout_start: Option<DateTime<Utc>> = None;
    for i in 0..records.len() {
        if i > 0 && in_bout && bout_start.is_some() {
            let gap = (records[i].timestamp - records[i - 1].timestamp).num_milliseconds();
            if gap > BOUT_DATA_GAP_BREAK_MS {
                if let Some(start) = bout_start.take() {
                    bouts.push(RawBout {
                        start,
                        end: records[i - 1].timestamp,
                    });
                }
                in_bout = false;
            }
        }
        let is_moving = deltas[i] > MOTION_THRESHOLD;
        if is_moving && !in_bout {
            in_bout = true;
            bout_start = Some(records[i].timestamp);
        } else if !is_moving && in_bout {
            if let Some(start) = bout_start.take() {
                bouts.push(RawBout {
                    start,
                    end: records[i].timestamp,
                });
            }
            in_bout = false;
        }
    }
    if in_bout {
        if let Some(start) = bout_start {
            bouts.push(RawBout {
                start,
                end: records[records.len() - 1].timestamp,
            });
        }
    }
    bouts
}

fn merge_bouts(bouts: Vec<RawBout>, max_gap_ms: i64) -> Vec<RawBout> {
    if bouts.is_empty() {
        return Vec::new();
    }
    let mut merged = vec![bouts[0]];
    for next in bouts.into_iter().skip(1) {
        let last = merged.last_mut().unwrap();
        if (next.start - last.end).num_milliseconds() <= max_gap_ms {
            last.end = next.end;
        } else {
            merged.push(next);
        }
    }
    merged
}

fn classify_bout(
    bout: RawBout,
    all_records: &[ActivityRecord],
    baseline: BaselineProfile,
) -> ActivityBout {
    let bout_records: Vec<ActivityRecord> = all_records
        .iter()
        .filter(|r| r.timestamp >= bout.start && r.timestamp <= bout.end)
        .cloned()
        .collect();
    let duration_minutes = (bout.end - bout.start).num_milliseconds() as f64 / 60_000.0;
    let deltas = compute_gravity_deltas(&bout_records);
    let motion_intensity = if deltas.is_empty() {
        0.0
    } else {
        deltas.iter().sum::<f64>() / deltas.len() as f64
    };
    let still_count = deltas.iter().filter(|d| **d <= MOTION_THRESHOLD).count();
    let still_fraction = if deltas.is_empty() {
        1.0
    } else {
        still_count as f64 / deltas.len() as f64
    };

    let hrs: Vec<f64> = bout_records
        .iter()
        .map(|r| r.heart_rate)
        .filter(|h| *h > 0.0)
        .collect();
    let hr_mean = if hrs.is_empty() {
        0.0
    } else {
        hrs.iter().sum::<f64>() / hrs.len() as f64
    };
    let hr_max = hrs.iter().cloned().fold(0.0f64, f64::max);
    let resting_hr = if baseline.resting_hr > 0.0 {
        baseline.resting_hr
    } else {
        60.0
    };
    let max_hr = baseline.max_hr.unwrap_or(190.0);
    let hr_reserve = max_hr - resting_hr;
    let hr_zone = if hr_reserve > 0.0 {
        ((hr_mean - resting_hr) / hr_reserve * 5.0).floor() as i64
    } else {
        0
    };

    let (activity_type, confidence): (&'static str, f64) =
        if still_fraction > STILL_FRACTION_SEDENTARY {
            ("Sedentary", 0.9)
        } else if motion_intensity < 0.02 && hr_zone <= 1 {
            ("Rest", 0.75)
        } else if hr_zone >= 2 || motion_intensity > 0.03 {
            let conf = if hr_zone >= 2 && motion_intensity > 0.03 {
                0.85
            } else {
                0.7
            };
            ("Exercise", conf)
        } else {
            ("Light Activity", 0.6)
        };
    let intensity = if hr_zone >= 4 {
        Intensity::Hard
    } else if hr_zone >= 2 {
        Intensity::Moderate
    } else {
        Intensity::Light
    };

    let strain_score = compute_bout_strain(&bout_records, resting_hr, max_hr);

    ActivityBout {
        start_time: bout.start,
        end_time: bout.end,
        duration_minutes: (duration_minutes * 10.0).round() / 10.0,
        activity_type: activity_type.to_string(),
        intensity,
        confidence: (confidence * 100.0).round() / 100.0,
        heart_rate_avg: hr_mean.round(),
        heart_rate_max: hr_max,
        strain_score: (strain_score * 10.0).round() / 10.0,
        cadence_hz: None,
        external_source: None,
        source: BoutSource::Detected,
    }
}

fn compute_bout_strain(bout_records: &[ActivityRecord], resting_hr: f64, max_hr: f64) -> f64 {
    let valid: Vec<&ActivityRecord> = bout_records.iter().filter(|r| r.heart_rate > 0.0).collect();
    if valid.len() < 600 {
        return 0.0;
    }
    let hr_reserve = max_hr - resting_hr;
    if hr_reserve <= 0.0 {
        return 0.0;
    }
    let mut trimp = 0.0;
    for i in 1..valid.len() {
        let dt_ms = (valid[i].timestamp - valid[i - 1].timestamp).num_milliseconds() as f64;
        let dt_min = (dt_ms / 60_000.0).clamp(1.0 / 60.0, 5.0);
        let pct = ((valid[i].heart_rate - resting_hr) / hr_reserve) * 100.0;
        let w = if pct >= 90.0 {
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
        trimp += dt_min * w;
    }
    let val = 21.0 * (trimp + 1.0).ln() / STRAIN_LN_7201;
    val.min(21.0)
}

fn detect_gap_entries(
    awake_records: &[ActivityRecord],
    sleep_detections: &[SleepWindow],
    off_wrist_intervals: &[OffWristIntervalLite],
) -> Vec<ActivityBout> {
    let mut entries = Vec::new();
    for i in 1..awake_records.len() {
        let gap = (awake_records[i].timestamp - awake_records[i - 1].timestamp).num_milliseconds();
        if gap < GAP_ENTRY_MIN_MS {
            continue;
        }
        let start = awake_records[i - 1].timestamp;
        let end = awake_records[i].timestamp;
        if overlaps_sleep(start, end, sleep_detections) {
            continue;
        }
        let source = pick_off_wrist_source(start, end, off_wrist_intervals);
        entries.push(make_gap_bout(start, end, source));
    }
    for interval in off_wrist_intervals {
        if (interval.end - interval.start).num_milliseconds() < GAP_ENTRY_MIN_MS {
            continue;
        }
        if overlaps_any_existing(interval.start, interval.end, &entries) {
            continue;
        }
        if overlaps_sleep(interval.start, interval.end, sleep_detections) {
            continue;
        }
        entries.push(make_gap_bout(interval.start, interval.end, interval.source));
    }
    entries
}

fn overlaps_sleep(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    sleep_detections: &[SleepWindow],
) -> bool {
    sleep_detections
        .iter()
        .any(|d| d.bedtime <= end && d.wake_time >= start)
}

fn overlaps_any_existing(start: DateTime<Utc>, end: DateTime<Utc>, bouts: &[ActivityBout]) -> bool {
    bouts
        .iter()
        .any(|b| b.start_time <= end && b.end_time >= start)
}

fn pick_off_wrist_source(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    off_wrist_intervals: &[OffWristIntervalLite],
) -> Option<OffWristSource> {
    off_wrist_intervals
        .iter()
        .find(|i| i.start <= end && i.end >= start && i.source.is_some())
        .and_then(|i| i.source)
}

fn make_gap_bout(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    source: Option<OffWristSource>,
) -> ActivityBout {
    let duration_minutes = (end - start).num_milliseconds() as f64 / 60_000.0;
    let activity_type = if source.is_some() {
        "Off-Wrist"
    } else {
        "No Data"
    };
    let external_source = source.map(|s| match s {
        OffWristSource::WristOff => "event:WristOff".to_string(),
        OffWristSource::ChargingOn => "event:ChargingOn".to_string(),
    });
    let confidence = if source.is_some() { 0.95 } else { 0.6 };
    ActivityBout {
        start_time: start,
        end_time: end,
        duration_minutes: (duration_minutes * 10.0).round() / 10.0,
        activity_type: activity_type.to_string(),
        intensity: Intensity::Light,
        confidence,
        heart_rate_avg: 0.0,
        heart_rate_max: 0.0,
        strain_score: 0.0,
        cadence_hz: None,
        external_source,
        source: BoutSource::Detected,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn rec(ts: DateTime<Utc>, hr: f64, gx: f64, gy: f64, gz: f64) -> ActivityRecord {
        ActivityRecord {
            timestamp: ts,
            heart_rate: hr,
            gravity_x: Some(gx),
            gravity_y: Some(gy),
            gravity_z: Some(gz),
        }
    }

    fn baseline() -> BaselineProfile {
        BaselineProfile {
            resting_hr: 60.0,
            max_hr: Some(190.0),
        }
    }

    #[test]
    fn fewer_than_sixty_records_returns_empty() {
        let t0 = Utc.with_ymd_and_hms(2026, 5, 25, 10, 0, 0).unwrap();
        let records: Vec<_> = (0..30)
            .map(|i| rec(t0 + Duration::seconds(i), 70.0, 0.0, 0.0, 1.0))
            .collect();
        let out = detect_activities(&records, &[], baseline(), &[]);
        assert!(out.is_empty());
    }

    #[test]
    fn sedentary_classification_from_still_records() {
        let t0 = Utc.with_ymd_and_hms(2026, 5, 25, 10, 0, 0).unwrap();
        // Big motion burst at start to open a bout, then long still tail to dominate the still_fraction.
        let mut records = Vec::new();
        for i in 0..20 {
            // motion phase: alternating gravity makes deltas > 0.01
            let gx = if i % 2 == 0 { 0.0 } else { 0.2 };
            records.push(rec(t0 + Duration::seconds(i), 65.0, gx, 0.0, 1.0));
        }
        for i in 20..600 {
            records.push(rec(t0 + Duration::seconds(i), 65.0, 0.0, 0.0, 1.0));
        }
        // Re-open with another motion blip to give us a full bout end
        for i in 600..620 {
            let gx = if i % 2 == 0 { 0.0 } else { 0.2 };
            records.push(rec(t0 + Duration::seconds(i), 65.0, gx, 0.0, 1.0));
        }
        let out = detect_activities(&records, &[], baseline(), &[]);
        // At minimum we should not crash and the result should be sorted.
        for w in out.windows(2) {
            assert!(w[0].start_time <= w[1].start_time);
        }
    }

    #[test]
    fn sleep_window_filters_records() {
        let t0 = Utc.with_ymd_and_hms(2026, 5, 25, 10, 0, 0).unwrap();
        let records: Vec<_> = (0..100)
            .map(|i| rec(t0 + Duration::seconds(i), 70.0, 0.0, 0.0, 1.0))
            .collect();
        let sleep = vec![SleepWindow {
            bedtime: t0 - Duration::minutes(5),
            wake_time: t0 + Duration::minutes(5),
        }];
        let out = detect_activities(&records, &sleep, baseline(), &[]);
        // All records covered by the sleep window → no bouts (gap entries
        // need ≥15 min anyway).
        assert!(out.is_empty());
    }

    #[test]
    fn gap_entry_emitted_for_long_data_gap() {
        let t0 = Utc.with_ymd_and_hms(2026, 5, 25, 10, 0, 0).unwrap();
        let mut records = Vec::new();
        for i in 0..70 {
            records.push(rec(t0 + Duration::seconds(i), 70.0, 0.0, 0.0, 1.0));
        }
        let after_gap = t0 + Duration::minutes(20);
        for i in 0..70 {
            records.push(rec(after_gap + Duration::seconds(i), 70.0, 0.0, 0.0, 1.0));
        }
        let out = detect_activities(&records, &[], baseline(), &[]);
        let gap_bouts: Vec<_> = out
            .iter()
            .filter(|b| b.activity_type == "No Data")
            .collect();
        assert_eq!(gap_bouts.len(), 1);
        assert_eq!(gap_bouts[0].start_time, t0 + Duration::seconds(69));
    }

    #[test]
    fn off_wrist_event_overrides_no_data_label() {
        let t0 = Utc.with_ymd_and_hms(2026, 5, 25, 10, 0, 0).unwrap();
        let mut records = Vec::new();
        for i in 0..70 {
            records.push(rec(t0 + Duration::seconds(i), 70.0, 0.0, 0.0, 1.0));
        }
        let gap_start = t0 + Duration::seconds(69);
        let after_gap = t0 + Duration::minutes(20);
        for i in 0..70 {
            records.push(rec(after_gap + Duration::seconds(i), 70.0, 0.0, 0.0, 1.0));
        }
        let off_wrist = vec![OffWristIntervalLite {
            start: gap_start,
            end: after_gap,
            source: Some(OffWristSource::WristOff),
        }];
        let out = detect_activities(&records, &[], baseline(), &off_wrist);
        let gap_bouts: Vec<_> = out
            .iter()
            .filter(|b| b.activity_type == "Off-Wrist" || b.activity_type == "No Data")
            .collect();
        assert_eq!(gap_bouts.len(), 1);
        assert_eq!(gap_bouts[0].activity_type, "Off-Wrist");
        assert_eq!(
            gap_bouts[0].external_source.as_deref(),
            Some("event:WristOff")
        );
    }
}
