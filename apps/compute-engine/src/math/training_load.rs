use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct StrainPoint {
    pub date: DateTime<Utc>,
    pub strain: f64,
}

#[derive(Debug, Clone)]
pub struct TrainingLoad {
    pub acute_load: f64,
    pub chronic_load: f64,
    pub ratio: f64,
    pub risk_zone: &'static str,
}

pub fn compute_training_load_ratio(history: &[StrainPoint]) -> Option<TrainingLoad> {
    if history.len() < 7 {
        return None;
    }
    let mut sorted: Vec<StrainPoint> = history.to_vec();
    sorted.sort_by_key(|p| p.date);

    let acute_alpha = 2.0 / (7.0 + 1.0);
    let chronic_alpha = 2.0 / (28.0 + 1.0);

    let mut acute_ewma = sorted[0].strain;
    let mut chronic_ewma = sorted[0].strain;

    for item in sorted.iter().skip(1) {
        acute_ewma = acute_alpha * item.strain + (1.0 - acute_alpha) * acute_ewma;
        chronic_ewma = chronic_alpha * item.strain + (1.0 - chronic_alpha) * chronic_ewma;
    }

    let ratio = if chronic_ewma > 0.1 {
        acute_ewma / chronic_ewma
    } else {
        1.0
    };

    let risk_zone: &'static str = if ratio < 0.8 {
        "low"
    } else if ratio <= 1.3 {
        "optimal"
    } else if ratio <= 1.5 {
        "high"
    } else {
        "danger"
    };

    Some(TrainingLoad {
        acute_load: (acute_ewma * 10.0).round() / 10.0,
        chronic_load: (chronic_ewma * 10.0).round() / 10.0,
        ratio: (ratio * 100.0).round() / 100.0,
        risk_zone,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn sp(secs: i64, strain: f64) -> StrainPoint {
        StrainPoint {
            date: ts(secs),
            strain,
        }
    }

    #[test]
    fn under_seven_days_returns_none() {
        let h: Vec<StrainPoint> = (0..6).map(|i| sp(i * 86_400, 10.0)).collect();
        assert!(compute_training_load_ratio(&h).is_none());
    }

    #[test]
    fn flat_seven_days_ratio_one_optimal() {
        let h: Vec<StrainPoint> = (0..7).map(|i| sp(i * 86_400, 10.0)).collect();
        let r = compute_training_load_ratio(&h).expect("expected Some");
        assert!((r.ratio - 1.0).abs() < 1e-9, "got {}", r.ratio);
        assert_eq!(r.risk_zone, "optimal");
        assert!((r.acute_load - 10.0).abs() < 1e-9);
        assert!((r.chronic_load - 10.0).abs() < 1e-9);
    }

    #[test]
    fn low_zone_when_acute_far_below_chronic() {
        // 28 days at 15, then 7 days at 5
        let mut h: Vec<StrainPoint> = Vec::new();
        for i in 0..28 {
            h.push(sp(i * 86_400, 15.0));
        }
        for i in 28..35 {
            h.push(sp(i * 86_400, 5.0));
        }
        let r = compute_training_load_ratio(&h).expect("expected Some");
        assert!(r.ratio < 0.8, "expected low zone ratio, got {}", r.ratio);
        assert_eq!(r.risk_zone, "low");
    }

    #[test]
    fn danger_zone_when_acute_spike() {
        // 28 days at 2, then 7 days at 20
        let mut h: Vec<StrainPoint> = Vec::new();
        for i in 0..28 {
            h.push(sp(i * 86_400, 2.0));
        }
        for i in 28..35 {
            h.push(sp(i * 86_400, 20.0));
        }
        let r = compute_training_load_ratio(&h).expect("expected Some");
        assert!(r.ratio > 1.5, "expected danger zone ratio, got {}", r.ratio);
        assert_eq!(r.risk_zone, "danger");
    }

    #[test]
    fn chronic_near_zero_defaults_ratio_one() {
        let h: Vec<StrainPoint> = (0..7).map(|i| sp(i * 86_400, 0.0)).collect();
        let r = compute_training_load_ratio(&h).expect("expected Some");
        assert!((r.ratio - 1.0).abs() < 1e-9);
        assert_eq!(r.risk_zone, "optimal");
    }

    #[test]
    fn unsorted_input_sorted_first() {
        let mut h: Vec<StrainPoint> = (0..7).map(|i| sp(i * 86_400, i as f64 + 1.0)).collect();
        h.reverse();
        let r = compute_training_load_ratio(&h).expect("expected Some");
        // After sort, the most recent point is the highest strain → acute > chronic slightly
        assert!(r.ratio >= 1.0);
    }
}
