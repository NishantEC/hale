use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;

const DEFAULT_TIME_ZONE: &str = "UTC";

fn resolve_tz(input: &str) -> Tz {
    if input.is_empty() {
        return DEFAULT_TIME_ZONE.parse::<Tz>().expect("UTC must parse");
    }
    input
        .parse::<Tz>()
        .unwrap_or_else(|_| DEFAULT_TIME_ZONE.parse::<Tz>().expect("UTC must parse"))
}

fn parse_date_key(key: &str) -> (i32, u32, u32) {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 3 {
        panic!(
            "Invalid calendar date key: \"{}\" (expected YYYY-MM-DD)",
            key
        );
    }
    let year: i32 = parts[0].parse().expect("year");
    let month: u32 = parts[1].parse().expect("month");
    let day: u32 = parts[2].parse().expect("day");
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        panic!("Invalid calendar date key: \"{}\"", key);
    }
    (year, month, day)
}

fn format_date_key(year: i32, month: u32, day: u32) -> String {
    format!("{:04}-{:02}-{:02}", year, month, day)
}

pub fn calendar_day_key(ts: DateTime<Utc>, tz_input: &str) -> String {
    let tz = resolve_tz(tz_input);
    let local = ts.with_timezone(&tz);
    format_date_key(local.year(), local.month(), local.day())
}

pub fn calendar_day_bounds(key: &str, tz_input: &str) -> (DateTime<Utc>, DateTime<Utc>) {
    let tz = resolve_tz(tz_input);
    let (year, month, day) = parse_date_key(key);

    // Match the JS impl: anchor next-day at UTC noon so we land on the correct
    // calendar day in any timezone, then reformat its UTC Y/M/D.
    let today = NaiveDate::from_ymd_opt(year, month, day).expect("valid date");
    let next = today.succ_opt().expect("next day");

    let start = zoned_midnight_to_utc(year, month, day, &tz);
    let end = zoned_midnight_to_utc(next.year(), next.month(), next.day(), &tz);
    (start, end)
}

fn zoned_midnight_to_utc(year: i32, month: u32, day: u32, tz: &Tz) -> DateTime<Utc> {
    let naive = NaiveDate::from_ymd_opt(year, month, day)
        .expect("valid date")
        .and_hms_opt(0, 0, 0)
        .expect("midnight");
    // For spring-forward gaps, .from_local_datetime is None; for fall-back
    // ambiguities, it is Ambiguous. Midnight is unambiguous in every IANA
    // zone we care about, so the single() path is the expected one.
    match tz.from_local_datetime(&naive) {
        chrono::LocalResult::Single(dt) => dt.with_timezone(&Utc),
        chrono::LocalResult::Ambiguous(earlier, _later) => earlier.with_timezone(&Utc),
        chrono::LocalResult::None => {
            // Spring-forward at midnight (very rare). Walk forward an hour at a time.
            let mut h = 1u32;
            loop {
                let attempt = NaiveDate::from_ymd_opt(year, month, day)
                    .expect("valid")
                    .and_hms_opt(h, 0, 0)
                    .expect("hms");
                if let chrono::LocalResult::Single(dt) = tz.from_local_datetime(&attempt) {
                    return dt.with_timezone(&Utc);
                }
                h += 1;
                if h >= 24 {
                    panic!(
                        "could not resolve zoned midnight for {}-{}-{}",
                        year, month, day
                    );
                }
            }
        }
    }
}

pub fn add_days_to_date_key(key: &str, days: i32) -> String {
    let (year, month, day) = parse_date_key(key);
    let base = NaiveDate::from_ymd_opt(year, month, day).expect("valid date");
    let shifted = base
        .checked_add_signed(chrono::Duration::days(days as i64))
        .expect("date arithmetic in range");
    format_date_key(shifted.year(), shifted.month(), shifted.day())
}
