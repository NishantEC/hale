use chrono::{DateTime, SecondsFormat, Utc};
use hale_compute_engine::calendar::{add_days_to_date_key, calendar_day_bounds, calendar_day_key};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Case {
    iso: String,
    tz: String,
    key: String,
    start: String,
    end: String,
}

fn fmt(dt: DateTime<Utc>) -> String {
    // %Y-%m-%dT%H:%M:%SZ — drop subsecond, force Z.
    dt.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn normalize_iso(s: &str) -> String {
    DateTime::parse_from_rfc3339(s)
        .expect("rfc3339")
        .with_timezone(&Utc)
        .to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[test]
fn calendar_fixture_cases() {
    let fixture = std::fs::read_to_string("tests/fixtures/calendar.json").expect("read fixture");
    let cases: Vec<Case> = serde_json::from_str(&fixture).expect("parse fixture");
    assert!(!cases.is_empty(), "fixture must contain cases");

    for c in &cases {
        let ts: DateTime<Utc> = DateTime::parse_from_rfc3339(&c.iso)
            .expect("iso parse")
            .with_timezone(&Utc);

        let key = calendar_day_key(ts, &c.tz);
        assert_eq!(key, c.key, "key mismatch for {:?}", c);

        let (start, end) = calendar_day_bounds(&c.key, &c.tz);
        assert_eq!(
            fmt(start),
            normalize_iso(&c.start),
            "start mismatch for {:?}",
            c
        );
        assert_eq!(fmt(end), normalize_iso(&c.end), "end mismatch for {:?}", c);
    }
}

#[test]
fn add_days_basic() {
    assert_eq!(add_days_to_date_key("2026-05-19", 0), "2026-05-19");
    assert_eq!(add_days_to_date_key("2026-05-19", 1), "2026-05-20");
    assert_eq!(add_days_to_date_key("2026-05-19", -1), "2026-05-18");
    assert_eq!(add_days_to_date_key("2026-01-01", -1), "2025-12-31");
    assert_eq!(add_days_to_date_key("2026-02-28", 1), "2026-03-01");
}
