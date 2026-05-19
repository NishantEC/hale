use crate::math::util::clamp;

#[derive(Debug, Clone)]
pub struct RecoveryIndexInput {
    pub hrv_rmssd: f64,
    pub baseline_rmssd: f64,
    pub lf_hf_ratio: Option<f64>,
    pub prev_day_strain: Option<f64>,
    pub spo2_average: Option<f64>,
    pub skin_temp_delta: Option<f64>,
    pub architecture_score: Option<f64>,
    pub sleep_duration_hours: f64,
    pub target_sleep_minutes: f64,
}

pub fn compute_recovery_index(input: &RecoveryIndexInput) -> Option<f64> {
    // 1. HRV Recovery (40%)
    let mut hrv_score = 50.0_f64;
    if input.baseline_rmssd > 0.0 && input.hrv_rmssd > 0.0 {
        let ratio = input.hrv_rmssd / input.baseline_rmssd;
        hrv_score = clamp(50.0 + (ratio - 1.0) * 100.0, 0.0, 100.0);
    }
    if let Some(lf_hf) = input.lf_hf_ratio {
        if lf_hf > 0.0 {
            let bonus = if lf_hf < 1.5 {
                10.0
            } else if lf_hf < 2.5 {
                0.0
            } else {
                -10.0
            };
            hrv_score = clamp(hrv_score + bonus, 0.0, 100.0);
        }
    }

    // 2. Sleep Quality (25%)
    let target_hours = input.target_sleep_minutes / 60.0;
    let duration_ratio = if target_hours > 0.0 {
        input.sleep_duration_hours / target_hours
    } else {
        1.0
    };
    let mut sleep_score = clamp(duration_ratio * 70.0, 0.0, 70.0);
    if let Some(arch) = input.architecture_score {
        sleep_score += (arch / 100.0) * 30.0;
    } else {
        sleep_score += 15.0;
    }
    sleep_score = clamp(sleep_score, 0.0, 100.0);

    // 3. Strain Recovery (15%)
    let strain_score = if let Some(s) = input.prev_day_strain {
        clamp(100.0 - (s / 21.0) * 80.0, 0.0, 100.0)
    } else {
        70.0
    };

    // 4. SpO2 (10%)
    let spo2_score = if let Some(s) = input.spo2_average {
        clamp(100.0 - (97.0 - s) * 15.0, 0.0, 100.0)
    } else {
        80.0
    };

    // 5. Temperature (10%)
    let temp_score = if let Some(d) = input.skin_temp_delta {
        clamp(100.0 - d.abs() * 50.0, 0.0, 100.0)
    } else {
        80.0
    };

    let index = (hrv_score * 0.40
        + sleep_score * 0.25
        + strain_score * 0.15
        + spo2_score * 0.10
        + temp_score * 0.10)
        .round();

    Some(clamp(index, 0.0, 100.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full_input() -> RecoveryIndexInput {
        RecoveryIndexInput {
            hrv_rmssd: 50.0,
            baseline_rmssd: 50.0,
            lf_hf_ratio: Some(1.0),
            prev_day_strain: Some(10.0),
            spo2_average: Some(97.0),
            skin_temp_delta: Some(0.0),
            architecture_score: Some(80.0),
            sleep_duration_hours: 8.0,
            target_sleep_minutes: 480.0,
        }
    }

    #[test]
    fn hrv_at_baseline_yields_mid_range_score() {
        let r = compute_recovery_index(&full_input()).expect("expected Some");
        // At baseline: hrv ratio=1 → score 50; +10 lf/hf bonus → 60
        // sleep: ratio 1 → 70 + 80%*30 = 70+24 = 94 → clamped 94
        // strain: 100 - (10/21)*80 ≈ 100 - 38.1 = 61.9
        // spo2: 100 - 0 = 100
        // temp: 100
        // index = 0.4*60 + 0.25*94 + 0.15*61.9 + 0.1*100 + 0.1*100 ≈ 24+23.5+9.285+10+10 = 76.785 → 77
        assert!((70.0..=85.0).contains(&r), "got {}", r);
    }

    #[test]
    fn degraded_hrv_lowers_score() {
        let mut i = full_input();
        i.hrv_rmssd = 10.0; // far below baseline
        i.lf_hf_ratio = Some(3.0); // sympathetic dominance bonus -10
        i.prev_day_strain = Some(18.0); // high strain
        i.spo2_average = Some(92.0); // low spo2
        i.skin_temp_delta = Some(1.2); // big deviation
        i.architecture_score = Some(20.0);
        i.sleep_duration_hours = 4.0;
        let r = compute_recovery_index(&i).expect("expected Some");
        // Should be substantially lower than the baseline case
        assert!(r < 50.0, "expected low score, got {}", r);
    }

    #[test]
    fn clamps_to_zero_to_hundred() {
        let mut i = full_input();
        // Wildly elevated hrv → score capped at 100
        i.hrv_rmssd = 500.0;
        i.baseline_rmssd = 50.0;
        let r = compute_recovery_index(&i).expect("expected Some");
        assert!((0.0..=100.0).contains(&r));
    }

    #[test]
    fn missing_optionals_use_defaults() {
        let i = RecoveryIndexInput {
            hrv_rmssd: 50.0,
            baseline_rmssd: 50.0,
            lf_hf_ratio: None,
            prev_day_strain: None,
            spo2_average: None,
            skin_temp_delta: None,
            architecture_score: None,
            sleep_duration_hours: 8.0,
            target_sleep_minutes: 480.0,
        };
        let r = compute_recovery_index(&i).expect("expected Some");
        // hrv at baseline: 50
        // sleep: 70 + default 15 = 85
        // strain default 70, spo2 default 80, temp default 80
        // 0.4*50 + 0.25*85 + 0.15*70 + 0.1*80 + 0.1*80 = 20+21.25+10.5+8+8 = 67.75 → 68
        assert!((65.0..=72.0).contains(&r), "got {}", r);
    }

    #[test]
    fn zero_baseline_rmssd_uses_default_hrv_score() {
        let mut i = full_input();
        i.baseline_rmssd = 0.0;
        i.lf_hf_ratio = None;
        let r = compute_recovery_index(&i).expect("expected Some");
        // hrv score = 50 (default), no lf/hf bonus
        // Score still in mid range
        assert!((50.0..=90.0).contains(&r), "got {}", r);
    }
}
