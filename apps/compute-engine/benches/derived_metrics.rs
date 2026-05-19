use criterion::{black_box, criterion_group, criterion_main, Criterion};
use noop_compute_engine::{derived_metrics::compute_derived_metrics, types::ComputeDerivedMetricsDayRequestV1};

fn bench_compute_day(c: &mut Criterion) {
    let fixture_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../backend/.fixtures/compute-engine-golden/normal-ist.json");
    let raw = std::fs::read_to_string(&fixture_path).expect("read fixture");
    let parsed: serde_json::Value = serde_json::from_str(&raw).expect("parse fixture");
    let input: ComputeDerivedMetricsDayRequestV1 =
        serde_json::from_value(parsed["input"].clone()).expect("deserialize input");
    c.bench_function("compute_day_normal_ist", |b| {
        b.iter(|| compute_derived_metrics(black_box(&input)).unwrap())
    });
}

criterion_group!(benches, bench_compute_day);
criterion_main!(benches);
