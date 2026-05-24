//! Sleep detection — port of apps/backend/src/processing/sleep-event-engine.ts
//!
//! Algorithm shape:
//!   1. Filter to records with non-null gravity (gravity-driven stillness).
//!   2. Gravity-magnitude delta per step → rolling 15-min window of
//!      "still" fraction; ≥70% still ⇒ candidate sleep epoch.
//!   3. Off-wrist gating (device events + skinContact).
//!   4. HR-assisted boundary refinement.
//!   5. Build periods, merge across short flips + small gaps.
//!   6. Drop short periods, off-wrist-by-HR periods, HR-above-baseline
//!      periods (likely sedentary, not sleep).
//!   7. Cluster into nights by calendar day + same-night gap.
//!   8. Emit one `SleepDetectionSummary` per night with regularity +
//!      confidence scores.
//!
//! Constants and thresholds mirror the TS source line-for-line so a
//! parity test against a golden fixture stays trivially comparable.

use chrono::{DateTime, Datelike, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use std::collections::BTreeMap;

const HISTORICAL_GAP_BREAK_SECONDS: i64 = 20 * 60;
const SHORT_FLIP_MERGE_SECONDS: i64 = 15 * 60;
const MIN_SLEEP_PERIOD_MS: i64 = 60 * 60 * 1000;
const SAME_NIGHT_GAP_MS: i64 = 4 * 60 * 60 * 1000;

const WRIST_CONTACT_MIN_HR_FRACTION: f64 = 0.3;
const SLEEP_HR_OFFSET_BPM: f64 = 8.0;
const SLEEP_HR_MAX_BPM: f64 = 85.0;

const MAX_OFF_WRIST_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone)]
pub struct HistoricalRecord {
    pub timestamp: DateTime<Utc>,
    pub heart_rate: f64,
    pub gravity_magnitude: Option<f64>,
    pub gravity_x: Option<f64>,
    pub gravity_y: Option<f64>,
    pub gravity_z: Option<f64>,
    pub skin_contact: Option<bool>,
}

#[derive(Debug, Clone, Copy)]
pub struct OffWristInterval {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy)]
pub struct SleepDetectionSummary {
    pub night_date: DateTime<Utc>,
    pub bedtime: DateTime<Utc>,
    pub wake_time: DateTime<Utc>,
    pub duration_hours: f64,
    pub interruption_count: i32,
    pub continuity: f64,
    pub regularity: f64,
    pub valid_coverage: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Copy)]
struct TempPeriod {
    is_sleep: bool,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy)]
struct NightGroup {
    night_date: DateTime<Utc>,
    bedtime: DateTime<Utc>,
    wake_time: DateTime<Utc>,
    duration_hours: f64,
    interruption_count: i32,
    continuity: f64,
    valid_coverage: f64,
}

pub fn detect(
    records: &[HistoricalRecord],
    time_zone: Option<Tz>,
    off_wrist_intervals: &[OffWristInterval],
) -> Vec<SleepDetectionSummary> {
    let mut sorted = records.to_vec();
    sorted.sort_by_key(|r| r.timestamp);

    let gravity_records: Vec<HistoricalRecord> = sorted
        .into_iter()
        .filter(|r| r.gravity_x.is_some() && r.gravity_y.is_some() && r.gravity_z.is_some())
        .collect();
    if gravity_records.len() < 12 {
        return Vec::new();
    }

    let interval_seconds = median_interval_seconds(&gravity_records);
    let window_size = std::cmp::max(
        3,
        ((15.0 * 60.0) / interval_seconds.max(1.0)).floor() as usize,
    );
    let deltas = gravity_deltas(&gravity_records);
    let mut is_sleep_flags = classify_sleep(&deltas, window_size);

    let off_wrist_sorted = sort_intervals(off_wrist_intervals);
    for (idx, flag) in is_sleep_flags.iter_mut().enumerate() {
        if !*flag {
            continue;
        }
        let record = &gravity_records[idx];
        if record.skin_contact == Some(false) {
            *flag = false;
            continue;
        }
        if is_inside_any_interval(record.timestamp, &off_wrist_sorted) {
            *flag = false;
        }
    }

    is_sleep_flags = hr_assisted_refinement(&gravity_records, is_sleep_flags);

    let raw_periods = build_periods(&gravity_records, &is_sleep_flags);
    let periods = merge_periods(
        raw_periods,
        HISTORICAL_GAP_BREAK_SECONDS,
        SHORT_FLIP_MERGE_SECONDS,
    );

    let long_sleeps: Vec<TempPeriod> = periods
        .into_iter()
        .filter(|p| {
            p.is_sleep
                && (p.end.timestamp_millis() - p.start.timestamp_millis()) >= MIN_SLEEP_PERIOD_MS
        })
        .collect();
    if long_sleeps.is_empty() {
        return Vec::new();
    }

    let wrist_contact_sleeps: Vec<TempPeriod> = long_sleeps
        .into_iter()
        .filter(|p| period_has_wrist_contact(p, &gravity_records))
        .collect();
    if wrist_contact_sleeps.is_empty() {
        return Vec::new();
    }

    let hr_gated = filter_by_hr_below_awake_baseline(&wrist_contact_sleeps, &gravity_records);
    if hr_gated.is_empty() {
        return Vec::new();
    }

    let groups = group_sleeps_by_night(&hr_gated, &gravity_records, interval_seconds, time_zone);
    if groups.is_empty() {
        return Vec::new();
    }

    let mut sorted_groups = groups;
    sorted_groups.sort_by_key(|g| g.night_date);

    sorted_groups
        .iter()
        .enumerate()
        .map(|(index, group)| {
            let regularity = regularity_score(index, &sorted_groups, time_zone);
            let confidence = clamp01(group.valid_coverage * 0.7 + group.continuity * 0.3);
            SleepDetectionSummary {
                night_date: group.night_date,
                bedtime: group.bedtime,
                wake_time: group.wake_time,
                duration_hours: group.duration_hours,
                interruption_count: group.interruption_count,
                continuity: group.continuity,
                regularity,
                valid_coverage: group.valid_coverage,
                confidence,
            }
        })
        .collect()
}

// ──────────────────────────────────────────────────────────────────────
//                              HELPERS
// ──────────────────────────────────────────────────────────────────────

fn gravity_magnitude(record: &HistoricalRecord) -> Option<f64> {
    if let Some(m) = record.gravity_magnitude {
        return Some(m);
    }
    let x = record.gravity_x?;
    let y = record.gravity_y?;
    let z = record.gravity_z?;
    Some((x * x + y * y + z * z).sqrt())
}

fn gravity_deltas(records: &[HistoricalRecord]) -> Vec<f64> {
    if records.is_empty() {
        return Vec::new();
    }
    let mut deltas = Vec::with_capacity(records.len());
    deltas.push(0.0_f64);
    for idx in 1..records.len() {
        let current = gravity_magnitude(&records[idx]).unwrap_or(0.0);
        let previous = gravity_magnitude(&records[idx - 1]).unwrap_or(0.0);
        deltas.push((current - previous).abs());
    }
    deltas
}

fn classify_sleep(deltas: &[f64], window_size: usize) -> Vec<bool> {
    if deltas.is_empty() {
        return Vec::new();
    }
    let half = std::cmp::max(1, window_size / 2);
    let n = deltas.len();
    deltas
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let start = index.saturating_sub(half);
            let end = std::cmp::min(n, index + half + 1);
            let window = &deltas[start..end];
            let still_count = window.iter().filter(|d| **d < 0.01).count();
            let still_fraction = still_count as f64 / std::cmp::max(1, window.len()) as f64;
            still_fraction >= 0.70
        })
        .collect()
}

fn build_periods(records: &[HistoricalRecord], sleep_flags: &[bool]) -> Vec<TempPeriod> {
    if records.len() != sleep_flags.len() || records.is_empty() {
        return Vec::new();
    }
    let gap_break_ms = HISTORICAL_GAP_BREAK_SECONDS * 1000;
    let mut periods = Vec::new();
    let mut run_start = 0usize;
    for idx in 1..=records.len() {
        let end_of_data = idx == records.len();
        let class_change = !end_of_data && sleep_flags[idx] != sleep_flags[run_start];
        let gap_break = !end_of_data
            && (records[idx].timestamp.timestamp_millis()
                - records[idx - 1].timestamp.timestamp_millis())
                > gap_break_ms;
        if end_of_data || class_change || gap_break {
            periods.push(TempPeriod {
                is_sleep: sleep_flags[run_start],
                start: records[run_start].timestamp,
                end: records[idx - 1].timestamp,
            });
            if !end_of_data {
                run_start = idx;
            }
        }
    }
    periods
}

fn merge_periods(
    periods: Vec<TempPeriod>,
    gap_break_seconds: i64,
    flip_merge_seconds: i64,
) -> Vec<TempPeriod> {
    if periods.is_empty() {
        return Vec::new();
    }
    let gap_break_ms = gap_break_seconds * 1000;
    let flip_merge_ms = flip_merge_seconds * 1000;
    let mut merged: Vec<TempPeriod> = Vec::new();
    let mut index = 0usize;
    let n = periods.len();

    while index < n {
        let current = periods[index];
        let current_duration = current.end.timestamp_millis() - current.start.timestamp_millis();
        let can_swallow = current_duration < flip_merge_ms
            && index > 0
            && index + 1 < n
            && periods[index - 1].is_sleep == periods[index + 1].is_sleep
            && (periods[index + 1].start.timestamp_millis()
                - periods[index - 1].end.timestamp_millis())
                <= gap_break_ms;
        if can_swallow {
            if let Some(previous) = merged.pop() {
                merged.push(TempPeriod {
                    is_sleep: previous.is_sleep,
                    start: previous.start,
                    end: periods[index + 1].end,
                });
            } else {
                merged.push(TempPeriod {
                    is_sleep: periods[index - 1].is_sleep,
                    start: periods[index - 1].start,
                    end: periods[index + 1].end,
                });
            }
            index += 2;
            continue;
        }
        let last = merged.last().copied();
        if let Some(last) = last {
            if last.is_sleep == current.is_sleep
                && (current.start.timestamp_millis() - last.end.timestamp_millis()) <= gap_break_ms
            {
                let updated = merged.pop().unwrap();
                merged.push(TempPeriod {
                    is_sleep: updated.is_sleep,
                    start: updated.start,
                    end: current.end,
                });
                index += 1;
                continue;
            }
        }
        merged.push(current);
        index += 1;
    }
    merged
}

fn sort_intervals(intervals: &[OffWristInterval]) -> Vec<OffWristInterval> {
    let mut out: Vec<OffWristInterval> = intervals
        .iter()
        .copied()
        .filter(|i| i.end.timestamp_millis() > i.start.timestamp_millis())
        .collect();
    out.sort_by_key(|i| i.start);
    out
}

fn is_inside_any_interval(timestamp: DateTime<Utc>, sorted_intervals: &[OffWristInterval]) -> bool {
    if sorted_intervals.is_empty() {
        return false;
    }
    let ts = timestamp.timestamp_millis();
    for interval in sorted_intervals {
        if interval.start.timestamp_millis() > ts {
            return false;
        }
        if interval.end.timestamp_millis() >= ts {
            return true;
        }
    }
    false
}

fn period_has_wrist_contact(period: &TempPeriod, records: &[HistoricalRecord]) -> bool {
    let start_ms = period.start.timestamp_millis();
    let end_ms = period.end.timestamp_millis();
    let mut total = 0usize;
    let mut with_hr = 0usize;
    let mut explicit_off = 0usize;
    for r in records {
        let ts = r.timestamp.timestamp_millis();
        if ts < start_ms || ts > end_ms {
            continue;
        }
        total += 1;
        if r.heart_rate > 0.0 {
            with_hr += 1;
        }
        if r.skin_contact == Some(false) {
            explicit_off += 1;
        }
    }
    if total == 0 {
        return false;
    }
    if (explicit_off as f64) / (total as f64) > 0.5 {
        return false;
    }
    (with_hr as f64) / (total as f64) >= WRIST_CONTACT_MIN_HR_FRACTION
}

fn period_hr_median(period: &TempPeriod, records: &[HistoricalRecord]) -> Option<f64> {
    let start_ms = period.start.timestamp_millis();
    let end_ms = period.end.timestamp_millis();
    let mut hrs: Vec<f64> = Vec::new();
    for r in records {
        let ts = r.timestamp.timestamp_millis();
        if ts < start_ms || ts > end_ms {
            continue;
        }
        if r.heart_rate > 0.0 {
            hrs.push(r.heart_rate);
        }
    }
    if hrs.is_empty() {
        return None;
    }
    hrs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    Some(hrs[hrs.len() / 2])
}

fn filter_by_hr_below_awake_baseline(
    candidates: &[TempPeriod],
    records: &[HistoricalRecord],
) -> Vec<TempPeriod> {
    if candidates.is_empty() {
        return Vec::new();
    }
    let mut sorted_candidates = candidates.to_vec();
    sorted_candidates.sort_by_key(|p| p.start);

    let mut awake_hrs: Vec<f64> = Vec::new();
    for r in records {
        if r.heart_rate <= 0.0 {
            continue;
        }
        let ts = r.timestamp.timestamp_millis();
        let mut inside = false;
        for c in &sorted_candidates {
            if c.start.timestamp_millis() > ts {
                break;
            }
            if c.end.timestamp_millis() >= ts {
                inside = true;
                break;
            }
        }
        if !inside {
            awake_hrs.push(r.heart_rate);
        }
    }

    if awake_hrs.len() < 30 {
        return candidates
            .iter()
            .copied()
            .filter(|p| match period_hr_median(p, records) {
                None => true,
                Some(m) => m <= SLEEP_HR_MAX_BPM,
            })
            .collect();
    }
    awake_hrs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let awake_median = awake_hrs[awake_hrs.len() / 2];
    candidates
        .iter()
        .copied()
        .filter(|p| match period_hr_median(p, records) {
            None => true,
            Some(m) => m <= SLEEP_HR_MAX_BPM && m <= awake_median - SLEEP_HR_OFFSET_BPM,
        })
        .collect()
}

fn pick_night_cluster(periods: &[TempPeriod]) -> Vec<TempPeriod> {
    if periods.len() <= 1 {
        return periods.to_vec();
    }
    let mut sorted = periods.to_vec();
    sorted.sort_by_key(|p| p.start);

    let mut anchor_idx = 0usize;
    let mut anchor_len: i64 = 0;
    for (i, p) in sorted.iter().enumerate() {
        let len = p.end.timestamp_millis() - p.start.timestamp_millis();
        if len > anchor_len {
            anchor_len = len;
            anchor_idx = i;
        }
    }
    let mut cluster: Vec<TempPeriod> = vec![sorted[anchor_idx]];

    // Expand backward
    let mut i: isize = anchor_idx as isize - 1;
    while i >= 0 {
        let gap = cluster[0].start.timestamp_millis() - sorted[i as usize].end.timestamp_millis();
        if gap > SAME_NIGHT_GAP_MS {
            break;
        }
        cluster.insert(0, sorted[i as usize]);
        i -= 1;
    }

    // Expand forward
    for next in sorted.iter().skip(anchor_idx + 1) {
        let last_end = cluster.last().unwrap().end.timestamp_millis();
        let gap = next.start.timestamp_millis() - last_end;
        if gap > SAME_NIGHT_GAP_MS {
            break;
        }
        cluster.push(*next);
    }
    cluster
}

fn start_of_day(date: DateTime<Utc>, time_zone: Option<Tz>) -> DateTime<Utc> {
    let tz = time_zone.unwrap_or(chrono_tz::UTC);
    let local = date.with_timezone(&tz);
    let midnight = tz
        .with_ymd_and_hms(local.year(), local.month(), local.day(), 0, 0, 0)
        .single()
        .unwrap_or(local);
    midnight.with_timezone(&Utc)
}

fn day_key(date: DateTime<Utc>, time_zone: Option<Tz>) -> i64 {
    start_of_day(date, time_zone).timestamp()
}

fn group_sleeps_by_night(
    sleep_periods: &[TempPeriod],
    records: &[HistoricalRecord],
    interval_seconds: f64,
    time_zone: Option<Tz>,
) -> Vec<NightGroup> {
    // First pass: bucket by calendar day of period end.
    let mut grouped: BTreeMap<i64, Vec<TempPeriod>> = BTreeMap::new();
    for period in sleep_periods {
        let key = day_key(period.end, time_zone);
        grouped.entry(key).or_default().push(*period);
    }

    let mut results: Vec<NightGroup> = Vec::new();
    for (_key, periods_for_day) in grouped {
        let day_periods = pick_night_cluster(&periods_for_day);
        if day_periods.is_empty() {
            continue;
        }
        let mut sorted = day_periods.clone();
        sorted.sort_by_key(|p| p.start);
        let first = sorted[0];
        let last = sorted[sorted.len() - 1];
        let total_sleep_ms: i64 = sorted
            .iter()
            .map(|p| p.end.timestamp_millis() - p.start.timestamp_millis())
            .sum();
        let duration_hours = total_sleep_ms as f64 / (3600.0 * 1000.0);
        let interruption_count = std::cmp::max(0, sorted.len() as i32 - 1);
        let envelope = std::cmp::max(
            1,
            last.end.timestamp_millis() - first.start.timestamp_millis(),
        ) as f64;
        let interruption_minutes = ((envelope - total_sleep_ms as f64) / (60.0 * 1000.0)).max(0.0);
        let continuity = clamp01(1.0 - interruption_minutes / 120.0);
        let valid_coverage = estimate_coverage(records, first.start, last.end, interval_seconds);
        results.push(NightGroup {
            night_date: start_of_day(last.end, time_zone),
            bedtime: first.start,
            wake_time: last.end,
            duration_hours,
            interruption_count,
            continuity,
            valid_coverage,
        });
    }
    results
}

fn estimate_coverage(
    records: &[HistoricalRecord],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    interval_seconds: f64,
) -> f64 {
    if end.timestamp_millis() <= start.timestamp_millis() {
        return 0.0;
    }
    let observed = records
        .iter()
        .filter(|r| {
            let ts = r.timestamp.timestamp_millis();
            ts >= start.timestamp_millis() && ts <= end.timestamp_millis()
        })
        .count();
    let span_seconds = (end.timestamp_millis() - start.timestamp_millis()) as f64 / 1000.0;
    let expected = std::cmp::max(1, (span_seconds / interval_seconds.max(1.0)).round() as i64);
    (observed as f64 / std::cmp::max(1, expected) as f64).min(1.0)
}

fn clock_minutes_in_tz(date: DateTime<Utc>, time_zone: Option<Tz>) -> f64 {
    let tz = time_zone.unwrap_or(chrono_tz::UTC);
    let local = date.with_timezone(&tz);
    (local.hour() * 60 + local.minute()) as f64
}

fn regularity_score(index: usize, groups: &[NightGroup], time_zone: Option<Tz>) -> f64 {
    let start = index.saturating_sub(6);
    let recent: &[NightGroup] = &groups[start..=index];
    if recent.len() < 3 {
        return 0.65;
    }
    let bed_minutes: Vec<f64> = recent
        .iter()
        .map(|g| clock_minutes_in_tz(g.bedtime, time_zone))
        .collect();
    let wake_minutes: Vec<f64> = recent
        .iter()
        .map(|g| clock_minutes_in_tz(g.wake_time, time_zone))
        .collect();
    let bed_std = sample_std(&bed_minutes);
    let wake_std = sample_std(&wake_minutes);
    let penalty = ((bed_std + wake_std) / 180.0).min(1.0);
    (1.0 - penalty).max(0.0)
}

fn median_interval_seconds(records: &[HistoricalRecord]) -> f64 {
    if records.len() <= 2 {
        return 60.0;
    }
    let mut intervals: Vec<f64> = Vec::new();
    for i in 1..records.len() {
        let diff = ((records[i].timestamp.timestamp_millis()
            - records[i - 1].timestamp.timestamp_millis()) as f64
            / 1000.0)
            .max(1.0);
        if diff < 300.0 {
            intervals.push(diff);
        }
    }
    if intervals.is_empty() {
        return 60.0;
    }
    intervals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    intervals[intervals.len() / 2]
}

fn hr_assisted_refinement(records: &[HistoricalRecord], flags: Vec<bool>) -> Vec<bool> {
    let heart_rates: Vec<f64> = records
        .iter()
        .map(|r| r.heart_rate)
        .filter(|hr| *hr > 0.0)
        .collect();
    if heart_rates.len() < 20 {
        return flags;
    }

    let mut sorted = heart_rates.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let night_median = sorted[sorted.len() / 2];
    let hr_std = pop_std(&heart_rates);
    if hr_std <= 0.0 {
        return flags;
    }

    let low_threshold = night_median - hr_std;
    let high_threshold = night_median + 2.0 * hr_std;

    let mut refined = flags;
    let n = refined.len();
    if n < 2 {
        return refined;
    }
    for i in 1..(n - 1) {
        let is_transition = refined[i - 1] != refined[i] || refined[i] != refined[i + 1];
        if !is_transition {
            continue;
        }
        let hr = records[i].heart_rate;
        if hr <= 0.0 {
            continue;
        }
        if !refined[i] && hr < low_threshold {
            refined[i] = true;
        }
        if refined[i] && hr > high_threshold {
            refined[i] = false;
        }
    }
    refined
}

pub fn build_off_wrist_intervals(
    events: &[(i32, DateTime<Utc>)], // (event_number, captured_at)
    window_end: DateTime<Utc>,
) -> Vec<OffWristInterval> {
    let mut sorted = events.to_vec();
    sorted.sort_by_key(|(_, ts)| *ts);
    let mut intervals: Vec<OffWristInterval> = Vec::new();
    let mut wrist_off_open: Option<DateTime<Utc>> = None;
    let mut charging_open: Option<DateTime<Utc>> = None;
    let push_bounded =
        |start: DateTime<Utc>, end: DateTime<Utc>, into: &mut Vec<OffWristInterval>| {
            let cap = start + chrono::Duration::milliseconds(MAX_OFF_WRIST_MS);
            let bounded_end = if end > cap { cap } else { end };
            into.push(OffWristInterval {
                start,
                end: bounded_end,
            });
        };
    for (event_number, captured_at) in sorted {
        match event_number {
            10 => {
                if wrist_off_open.is_none() {
                    wrist_off_open = Some(captured_at);
                }
            }
            9 => {
                if let Some(open) = wrist_off_open.take() {
                    push_bounded(open, captured_at, &mut intervals);
                }
            }
            7 => {
                if charging_open.is_none() {
                    charging_open = Some(captured_at);
                }
            }
            8 => {
                if let Some(open) = charging_open.take() {
                    push_bounded(open, captured_at, &mut intervals);
                }
            }
            _ => {}
        }
    }
    if let Some(open) = wrist_off_open {
        push_bounded(open, window_end, &mut intervals);
    }
    if let Some(open) = charging_open {
        push_bounded(open, window_end, &mut intervals);
    }
    intervals
}

// ──────────────────────────────────────────────────────────────────────
//                          NUMERIC HELPERS
// ──────────────────────────────────────────────────────────────────────

fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

/// Sample stdev — divides by N. Matches the TS `standardDeviation` in
/// utils.ts which divides by length (population), not N-1.
fn pop_std(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let avg = values.iter().sum::<f64>() / values.len() as f64;
    let variance = values.iter().map(|v| (v - avg).powi(2)).sum::<f64>() / values.len() as f64;
    variance.sqrt()
}

fn sample_std(values: &[f64]) -> f64 {
    pop_std(values)
}

// ──────────────────────────────────────────────────────────────────────
//                               TESTS
// ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn t(epoch_secs: i64) -> DateTime<Utc> {
        DateTime::<Utc>::from_timestamp(epoch_secs, 0).unwrap()
    }

    fn still_record(ts: DateTime<Utc>, hr: f64) -> HistoricalRecord {
        HistoricalRecord {
            timestamp: ts,
            heart_rate: hr,
            gravity_magnitude: None,
            gravity_x: Some(0.0),
            gravity_y: Some(0.0),
            gravity_z: Some(1.0),
            skin_contact: Some(true),
        }
    }

    fn moving_record(ts: DateTime<Utc>, hr: f64, offset: f64) -> HistoricalRecord {
        // offset varies the gravity magnitude so adjacent samples produce
        // a non-zero |Δmag| (the stillness classifier looks at magnitude
        // change, not vector change). offset=0.0 → mag=1.0; offset=0.2 →
        // mag≈1.077; alternating 0/0.2 yields ~0.077 deltas, well above
        // the 0.01 still threshold.
        HistoricalRecord {
            timestamp: ts,
            heart_rate: hr,
            gravity_magnitude: None,
            gravity_x: Some(0.0),
            gravity_y: Some(offset),
            gravity_z: Some(1.0),
            skin_contact: Some(true),
        }
    }

    #[test]
    fn empty_input_returns_empty() {
        let out = detect(&[], None, &[]);
        assert!(out.is_empty());
    }

    #[test]
    fn fewer_than_twelve_gravity_records_returns_empty() {
        let mut records = Vec::new();
        for i in 0..6 {
            records.push(still_record(t(i as i64 * 60), 55.0));
        }
        let out = detect(&records, None, &[]);
        assert!(out.is_empty());
    }

    #[test]
    fn detects_a_simple_overnight_sleep() {
        // Generate 8 hours of still records at 1-minute cadence overnight,
        // bracketed by 2 hours of moving records on each side (so the
        // awake-baseline HR can be computed and the gravity-delta classifier
        // has wake context).
        let mut records = Vec::new();
        let bedtime = t(1_000_000); // arbitrary epoch start
        // Pre-sleep moving period — 2 hours at 1 minute spacing
        for i in 0..120 {
            let ts = bedtime - Duration::minutes(120 - i);
            // Awake HR ~80; oscillating gravity
            let offset = if i % 2 == 0 { 0.0 } else { 0.2 };
            records.push(moving_record(ts, 80.0, offset));
        }
        // Sleep window: 8 hours of still records at HR 55
        for i in 0..(8 * 60) {
            let ts = bedtime + Duration::minutes(i as i64);
            records.push(still_record(ts, 55.0));
        }
        // Post-sleep moving period — 2 hours at 1 minute spacing
        let wake = bedtime + Duration::hours(8);
        for i in 1..=120 {
            let ts = wake + Duration::minutes(i as i64);
            let offset = if i % 2 == 0 { 0.0 } else { 0.2 };
            records.push(moving_record(ts, 80.0, offset));
        }

        let out = detect(&records, None, &[]);
        assert_eq!(out.len(), 1, "expected one detected night, got {:?}", out);
        let night = out[0];
        // Sleep duration should be approximately 8h.
        assert!(
            (night.duration_hours - 8.0).abs() < 0.5,
            "duration_hours ~ 8h, got {}",
            night.duration_hours
        );
        // Confidence should be a real number in [0, 1].
        assert!(night.confidence > 0.0 && night.confidence <= 1.0);
        // Bedtime should be ≤ wake time.
        assert!(night.bedtime <= night.wake_time);
    }

    #[test]
    fn off_wrist_window_suppresses_sleep() {
        // Same shape as above but bracket the night with an off-wrist
        // event covering the entire sleep span.
        let mut records = Vec::new();
        let bedtime = t(2_000_000);
        for i in 0..120 {
            let ts = bedtime - Duration::minutes(120 - i);
            let offset = if i % 2 == 0 { 0.0 } else { 0.2 };
            records.push(moving_record(ts, 80.0, offset));
        }
        for i in 0..(8 * 60) {
            let ts = bedtime + Duration::minutes(i as i64);
            records.push(still_record(ts, 55.0));
        }
        let wake = bedtime + Duration::hours(8);
        for i in 1..=120 {
            let ts = wake + Duration::minutes(i as i64);
            let offset = if i % 2 == 0 { 0.0 } else { 0.2 };
            records.push(moving_record(ts, 80.0, offset));
        }
        let off_wrist = vec![OffWristInterval {
            start: bedtime - Duration::minutes(5),
            end: wake + Duration::minutes(5),
        }];
        let out = detect(&records, None, &off_wrist);
        assert!(
            out.is_empty(),
            "off-wrist window should suppress detection, got {:?}",
            out
        );
    }

    #[test]
    fn build_off_wrist_intervals_pairs_open_and_close() {
        let base = t(3_000_000);
        let events = vec![
            (10, base),                        // WristOff
            (9, base + Duration::minutes(30)), // WristOn
            (7, base + Duration::minutes(60)), // ChargingOn
            (8, base + Duration::minutes(80)), // ChargingOff
        ];
        let out = build_off_wrist_intervals(&events, base + Duration::hours(2));
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].start, base);
        assert_eq!(out[0].end, base + Duration::minutes(30));
        assert_eq!(out[1].start, base + Duration::minutes(60));
        assert_eq!(out[1].end, base + Duration::minutes(80));
    }

    #[test]
    fn unclosed_off_wrist_caps_at_window_or_max() {
        let base = t(4_000_000);
        let events = vec![(10, base)];
        let out = build_off_wrist_intervals(&events, base + Duration::hours(2));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].start, base);
        // Capped at window_end (2h < 24h MAX cap).
        assert_eq!(out[0].end, base + Duration::hours(2));
    }
}
