use noop_compute_engine::build_app;
use std::net::SocketAddr;
use std::path::PathBuf;

#[tokio::test]
async fn round_trip_normal_ist() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../backend/.fixtures/compute-engine-golden");
    let fixture_path = dir.join("normal-ist.json");
    let raw = std::fs::read_to_string(&fixture_path).unwrap();
    let fixture: serde_json::Value = serde_json::from_str(&raw).unwrap();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr: SocketAddr = listener.local_addr().unwrap();
    let app = build_app();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });

    let client = reqwest::Client::new();
    let res = client
        .post(format!("http://{addr}/v1/compute/derived-metrics-day"))
        .json(&fixture["input"])
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200, "expected 200, got {}", res.status());
    let body: serde_json::Value = res.json().await.unwrap();

    fn num(v: &serde_json::Value) -> Option<f64> {
        v.as_f64().or_else(|| if v.is_null() { None } else { Some(0.0) })
    }
    let close = |name: &str, a: &serde_json::Value, b: &serde_json::Value| {
        let (na, nb) = (num(a), num(b));
        match (na, nb) {
            (Some(x), Some(y)) => assert!((x - y).abs() < 1e-4, "{name}: {x} vs {y}"),
            (None, None) => {}
            _ => panic!("{name}: {a:?} vs {b:?}"),
        }
    };
    let expected = &fixture["expected"];
    for k in [
        "strainScore",
        "stressAverage",
        "spo2Average",
        "skinTempAvgCelsius",
        "recoveryIndex",
        "trainingLoadRatio",
    ] {
        close(k, &body[k], &expected[k]);
    }

    server.abort();
}

#[tokio::test]
async fn bad_schema_version_returns_400() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr: SocketAddr = listener.local_addr().unwrap();
    let app = build_app();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "schemaVersion": 2,
        "samples": [],
        "sensorRecords": [],
        "nightFeatures": [],
        "sleepDetections": [],
        "baseline": {
            "restingHeartRate": 0,
            "rmssd": 0,
            "sdnn": 0,
            "nightsUsed": 0,
            "isWarmedUp": false,
            "maxHeartRate": null
        },
        "referenceDate": "2026-01-01",
        "timeZone": "UTC"
    });
    let res = client
        .post(format!("http://{addr}/v1/compute/derived-metrics-day"))
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
    server.abort();
}
