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

use crate::types::HistoricalSensorRecordV1;

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
            a.gravity_x, a.gravity_y, a.gravity_z,
            b.gravity_x, b.gravity_y, b.gravity_z,
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
        let gap_break = !end_of_data && (records[i].timestamp - records[i - 1].timestamp) > gap_threshold;

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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration as ChronoDuration, TimeZone};

    fn base() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()
    }

    fn record(minutes_from_base: i64, gravity: Option<[f64; 3]>) -> HistoricalSensorRecordV1 {
        let (gx, gy, gz) = match gravity {
            Some([x, y, z]) => (Some(x), Some(y), Some(z)),
            None => (None, None, None),
        };
        HistoricalSensorRecordV1 {
            timestamp: base() + ChronoDuration::minutes(minutes_from_base),
            heart_rate: 70.0,
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
        assert!(segs.len() >= 2, "expected gap to split; got {} segments", segs.len());
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
        let active_count = segs.iter().filter(|s| s.motion == MotionState::Active).count();
        assert_eq!(active_count, 0, "expected blip to be absorbed; got {:?}", segs);
    }

    // --- 262-min regression -------------------------------------------------

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
