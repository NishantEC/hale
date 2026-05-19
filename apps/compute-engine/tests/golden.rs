use noop_compute_engine::{
    derived_metrics::compute_derived_metrics,
    types::{ComputeDerivedMetricsDayRequestV1, PersistedDailyMetricV1},
};
use std::{fs, path::PathBuf};

#[derive(serde::Deserialize)]
struct Fixture {
    description: String,
    input: ComputeDerivedMetricsDayRequestV1,
    expected: PersistedDailyMetricV1,
}

#[test]
fn golden_parity() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../backend/.fixtures/compute-engine-golden");
    let mut total = 0;
    let mut failed: Vec<String> = vec![];
    for entry in fs::read_dir(&dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if path.file_name().and_then(|s| s.to_str()) == Some(".gitkeep") {
            continue;
        }
        let raw = fs::read_to_string(&path).unwrap();
        let f: Fixture = serde_json::from_str(&raw)
            .unwrap_or_else(|e| panic!("parse {}: {}", path.display(), e));
        total += 1;
        let actual = compute_derived_metrics(&f.input)
            .unwrap_or_else(|e| panic!("{}: {:?}", f.description, e));
        if let Err(diff) = compare(&actual, &f.expected) {
            failed.push(format!("{}: {}", f.description, diff));
        }
    }
    assert!(total > 0, "no fixtures found");
    if !failed.is_empty() {
        panic!(
            "{} of {} fixtures failed:\n{}",
            failed.len(),
            total,
            failed.join("\n")
        );
    }
    println!("all {total} fixtures match");
}

fn compare(a: &PersistedDailyMetricV1, b: &PersistedDailyMetricV1) -> Result<(), String> {
    fn close(name: &str, a: Option<f64>, b: Option<f64>) -> Result<(), String> {
        match (a, b) {
            (None, None) => Ok(()),
            (Some(x), Some(y)) if (x - y).abs() < 1e-4 => Ok(()),
            (Some(x), Some(y)) => Err(format!("{name}: {x} vs {y} (diff {})", (x - y).abs())),
            (a, b) => Err(format!("{name}: {a:?} vs {b:?}")),
        }
    }
    close("strain_score", a.strain_score, b.strain_score)?;
    close("sleep_consistency_score", a.sleep_consistency_score, b.sleep_consistency_score)?;
    if (a.detected_sleep_nights - b.detected_sleep_nights).abs() > 1e-9 {
        return Err(format!(
            "detected_sleep_nights: {} vs {}",
            a.detected_sleep_nights, b.detected_sleep_nights
        ));
    }
    close("skin_temp_avg_celsius", a.skin_temp_avg_celsius, b.skin_temp_avg_celsius)?;
    close("skin_temp_delta_celsius", a.skin_temp_delta_celsius, b.skin_temp_delta_celsius)?;
    close("stress_average", a.stress_average, b.stress_average)?;
    close("spo2_average", a.spo2_average, b.spo2_average)?;
    close("lf_hf_ratio_average", a.lf_hf_ratio_average, b.lf_hf_ratio_average)?;
    close("recovery_index", a.recovery_index, b.recovery_index)?;
    close("training_load_ratio", a.training_load_ratio, b.training_load_ratio)?;
    if a.training_load_risk_zone != b.training_load_risk_zone {
        return Err(format!(
            "training_load_risk_zone: {:?} vs {:?}",
            a.training_load_risk_zone, b.training_load_risk_zone
        ));
    }
    close("spo2_dip_count", a.spo2_dip_count, b.spo2_dip_count)?;
    close("odi_per_hour", a.odi_per_hour, b.odi_per_hour)?;
    close("lowest_spo2", a.lowest_spo2, b.lowest_spo2)?;
    close("core_temperature_estimate", a.core_temperature_estimate, b.core_temperature_estimate)?;
    if a.circadian_nadir != b.circadian_nadir {
        return Err(format!(
            "circadian_nadir: {:?} vs {:?}",
            a.circadian_nadir, b.circadian_nadir
        ));
    }
    close("sleep_architecture_score", a.sleep_architecture_score, b.sleep_architecture_score)?;
    Ok(())
}
