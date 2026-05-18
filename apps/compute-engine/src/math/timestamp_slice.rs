use chrono::{DateTime, Utc};

use super::util::average;

pub trait HasTimestamp {
    fn timestamp(&self) -> DateTime<Utc>;
}

pub trait HasValue {
    fn value(&self) -> f64;
}

impl HasTimestamp for (DateTime<Utc>, f64) {
    fn timestamp(&self) -> DateTime<Utc> {
        self.0
    }
}

impl HasValue for (DateTime<Utc>, f64) {
    fn value(&self) -> f64 {
        self.1
    }
}

fn lower_bound<T: HasTimestamp>(arr: &[T], target: DateTime<Utc>) -> usize {
    let mut lo = 0usize;
    let mut hi = arr.len();
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if arr[mid].timestamp() < target {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    lo
}

/// Half-open `[start, end)`. Mirrors the JS implementation's binary-search slice.
pub fn slice_by_timestamp<'a, T: HasTimestamp>(
    arr: &'a [T],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> &'a [T] {
    if arr.is_empty() {
        return &[];
    }
    let lo = lower_bound(arr, start);
    if lo >= arr.len() {
        return &[];
    }
    let hi = lower_bound(arr, end);
    if hi <= lo {
        return &[];
    }
    &arr[lo..hi]
}

pub fn average_by_timestamp<T: HasTimestamp + HasValue>(
    arr: &[T],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Option<f64> {
    let slice = slice_by_timestamp(arr, start, end);
    if slice.is_empty() {
        return None;
    }
    let values: Vec<f64> = slice.iter().map(|p| p.value()).collect();
    Some(average(&values))
}

pub fn sum_by_timestamp<T: HasTimestamp + HasValue>(
    arr: &[T],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> f64 {
    slice_by_timestamp(arr, start, end)
        .iter()
        .map(|p| p.value())
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn pts() -> Vec<(DateTime<Utc>, f64)> {
        vec![
            (ts(10), 1.0),
            (ts(20), 2.0),
            (ts(30), 3.0),
            (ts(40), 4.0),
            (ts(50), 5.0),
        ]
    }

    #[test]
    fn slice_basic_three_points() {
        let arr = pts();
        // [t=20, t=40) → indices 1,2 → values 2,3 → 2 of them? Spec says
        // "slice [t1, t4) returns 3 of them" — with t1=10, t4=40 we want
        // timestamps 10,20,30 → 3 elements.
        let s = slice_by_timestamp(&arr, ts(10), ts(40));
        assert_eq!(s.len(), 3);
        assert_eq!(s[0].1, 1.0);
        assert_eq!(s[2].1, 3.0);
    }

    #[test]
    fn slice_inclusive_start_exclusive_end() {
        let arr = pts();
        let s = slice_by_timestamp(&arr, ts(20), ts(40));
        // 20 included, 40 excluded
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].1, 2.0);
        assert_eq!(s[1].1, 3.0);
    }

    #[test]
    fn slice_empty_input() {
        let arr: Vec<(DateTime<Utc>, f64)> = vec![];
        let s = slice_by_timestamp(&arr, ts(0), ts(100));
        assert!(s.is_empty());
    }

    #[test]
    fn slice_window_outside() {
        let arr = pts();
        assert!(slice_by_timestamp(&arr, ts(100), ts(200)).is_empty());
        assert!(slice_by_timestamp(&arr, ts(0), ts(5)).is_empty());
    }

    #[test]
    fn average_by_timestamp_basic() {
        let arr = pts();
        let v = average_by_timestamp(&arr, ts(10), ts(40));
        assert_eq!(v, Some(2.0));
    }

    #[test]
    fn average_by_timestamp_empty_returns_none() {
        let arr = pts();
        assert_eq!(average_by_timestamp(&arr, ts(100), ts(200)), None);
    }

    #[test]
    fn sum_by_timestamp_basic() {
        let arr = pts();
        assert_eq!(sum_by_timestamp(&arr, ts(10), ts(40)), 6.0);
        assert_eq!(sum_by_timestamp(&arr, ts(100), ts(200)), 0.0);
    }
}
